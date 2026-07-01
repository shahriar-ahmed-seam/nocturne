package com.novelreader.chunkreader

import android.content.ContentResolver
import android.net.Uri
import com.facebook.react.bridge.*
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Native module that provides chunked, UTF-8-safe streaming reads from
 * SAF content:// URIs. Each "session" wraps an InputStream with:
 *
 *  - Fixed-size byte reads (default 64 KB)
 *  - UTF-8 boundary correction (never splits a multi-byte codepoint)
 *  - Seek-by-reopening (SAF InputStreams are not seekable natively)
 *
 * JS calls:
 *   openStream(uri, chunkSize)     → sessionId
 *   readChunk(sessionId)           → { text, startOffset, endOffset, isEof }
 *   seekStream(sessionId, offset)  → void  (closes + reopens)
 *   closeStream(sessionId)         → void
 *   getFileSize(uri)               → long
 */
class ChunkReaderModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ChunkReaderModule"

    // ── Session bookkeeping ────────────────────────────────────────────────

    private data class StreamSession(
        val uri: Uri,
        val chunkSizeBytes: Int,
        var stream: InputStream,
        var currentOffset: Long,
        val totalBytes: Long,
        /** Leftover bytes from the previous read that were part of an incomplete UTF-8 char. */
        var utf8Remainder: ByteArray = ByteArray(0),
    )

    private val nextId = AtomicLong(1)
    private val sessions = ConcurrentHashMap<String, StreamSession>()

    private fun resolver(): ContentResolver =
        reactApplicationContext.contentResolver

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Open a new chunked reader session for the given content:// URI.
     * Returns a unique session ID string.
     */
    @ReactMethod
    fun openStream(uriString: String, chunkSize: Int, promise: Promise) {
        try {
            val uri = Uri.parse(uriString)
            val cr = resolver()

            // Get file size via ContentResolver.query
            val totalBytes = getFileSizeInternal(cr, uri)
            if (totalBytes < 0) {
                promise.reject("READ_ERROR", "Cannot determine file size for $uriString")
                return
            }

            val stream = cr.openInputStream(uri)
                ?: return promise.reject("READ_ERROR", "Cannot open InputStream for $uriString")

            val sessionId = "chunk_${nextId.getAndIncrement()}"
            sessions[sessionId] = StreamSession(
                uri = uri,
                chunkSizeBytes = if (chunkSize > 0) chunkSize else 65_536,
                stream = stream,
                currentOffset = 0L,
                totalBytes = totalBytes,
            )

            val result = Arguments.createMap().apply {
                putString("sessionId", sessionId)
                putDouble("totalBytes", totalBytes.toDouble())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("READ_ERROR", "openStream failed: ${e.message}", e)
        }
    }

    /**
     * Read the next chunk from the session's InputStream.
     *
     * **UTF-8 Safety:** After reading `chunkSizeBytes` raw bytes, we scan
     * backwards from the end to find the last complete UTF-8 character
     * boundary. Any trailing incomplete bytes are saved in `utf8Remainder`
     * and prepended to the next read.
     */
    @ReactMethod
    fun readChunk(sessionId: String, promise: Promise) {
        val session = sessions[sessionId]
            ?: return promise.reject("STREAM_ERROR", "No session with id: $sessionId")

        try {
            val buffer = ByteArray(session.chunkSizeBytes)
            val startOffset = session.currentOffset

            // Prepend any remainder from the previous chunk
            val remainder = session.utf8Remainder
            val remainderLen = remainder.size
            if (remainderLen > 0) {
                System.arraycopy(remainder, 0, buffer, 0, remainderLen)
                session.utf8Remainder = ByteArray(0)
            }

            // Fill the rest of the buffer from the stream
            val maxRead = session.chunkSizeBytes - remainderLen
            var totalRead = remainderLen
            if (maxRead > 0) {
                var offset = remainderLen
                var remaining = maxRead
                while (remaining > 0) {
                    val n = session.stream.read(buffer, offset, remaining)
                    if (n == -1) break
                    offset += n
                    remaining -= n
                    totalRead = offset
                }
            }

            if (totalRead == remainderLen && maxRead > 0) {
                // Stream exhausted — no new bytes were read beyond the remainder
                val isEof = true
                val text = if (totalRead > 0) String(buffer, 0, totalRead, Charsets.UTF_8) else ""
                session.currentOffset += totalRead - remainderLen

                val result = Arguments.createMap().apply {
                    putDouble("startOffset", startOffset.toDouble())
                    putDouble("endOffset", session.currentOffset.toDouble())
                    putString("text", text)
                    putBoolean("isEof", isEof)
                }
                promise.resolve(result)
                return
            }

            // ── UTF-8 boundary correction ────────────────────────────────
            val validEnd = findUtf8SafeBoundary(buffer, totalRead)
            val tailLen = totalRead - validEnd
            if (tailLen > 0) {
                // Save the incomplete trailing bytes for the next call
                session.utf8Remainder = buffer.copyOfRange(validEnd, totalRead)
            }

            val text = String(buffer, 0, validEnd, Charsets.UTF_8)
            // Advance the stream offset by only the NEW bytes consumed
            // (validEnd includes the remainder prefix, so subtract it)
            val newBytesConsumed = validEnd - remainderLen
            session.currentOffset += newBytesConsumed

            val isEof = (session.currentOffset >= session.totalBytes) && tailLen == 0

            val result = Arguments.createMap().apply {
                putDouble("startOffset", startOffset.toDouble())
                putDouble("endOffset", session.currentOffset.toDouble())
                putString("text", text)
                putBoolean("isEof", isEof)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STREAM_ERROR", "readChunk failed: ${e.message}", e)
        }
    }

    /**
     * Seek to a byte offset by closing the current InputStream and
     * re-opening + skipping. SAF InputStreams don't support random access,
     * so this is the only reliable method.
     */
    @ReactMethod
    fun seekStream(sessionId: String, byteOffset: Double, promise: Promise) {
        val session = sessions[sessionId]
            ?: return promise.reject("STREAM_ERROR", "No session with id: $sessionId")

        try {
            session.stream.close()
            val newStream = resolver().openInputStream(session.uri)
                ?: return promise.reject("READ_ERROR", "Cannot reopen InputStream for seek")

            val target = byteOffset.toLong()
            var skipped = 0L
            while (skipped < target) {
                val n = newStream.skip(target - skipped)
                if (n == 0L) {
                    // Try reading a single byte to move past potential buffering issues
                    if (newStream.read() == -1) break
                    skipped += 1
                } else {
                    skipped += n
                }
            }

            session.stream = newStream
            session.currentOffset = skipped
            session.utf8Remainder = ByteArray(0)

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STREAM_ERROR", "seekStream failed: ${e.message}", e)
        }
    }

    /**
     * Close the session's InputStream and remove it from the map.
     */
    @ReactMethod
    fun closeStream(sessionId: String, promise: Promise) {
        val session = sessions.remove(sessionId)
        if (session != null) {
            try {
                session.stream.close()
            } catch (_: Exception) { /* swallow */ }
        }
        promise.resolve(null)
    }

    /**
     * Return the file size for a content:// URI without opening a stream.
     */
    @ReactMethod
    fun getFileSize(uriString: String, promise: Promise) {
        try {
            val uri = Uri.parse(uriString)
            val size = getFileSizeInternal(resolver(), uri)
            if (size < 0) {
                promise.reject("READ_ERROR", "Cannot determine file size for $uriString")
            } else {
                promise.resolve(size.toDouble())
            }
        } catch (e: Exception) {
            promise.reject("READ_ERROR", "getFileSize failed: ${e.message}", e)
        }
    }

    // ── Internals ──────────────────────────────────────────────────────────

    /**
     * Scan backwards from `end` in `buffer` to find the last index where a
     * complete UTF-8 character ends. Returns the number of valid bytes.
     *
     * UTF-8 encoding rules:
     *   0xxxxxxx  → 1-byte char (ASCII)
     *   110xxxxx  → 2-byte char start
     *   1110xxxx  → 3-byte char start
     *   11110xxx  → 4-byte char start
     *   10xxxxxx  → continuation byte
     *
     * Strategy: If the last byte is a continuation byte (10xxxxxx), walk
     * backwards to find the start byte, check if the sequence has enough
     * continuation bytes to be complete. If not, trim it.
     */
    private fun findUtf8SafeBoundary(buffer: ByteArray, end: Int): Int {
        if (end == 0) return 0

        // Start from the last byte
        var i = end - 1

        // If the last byte is ASCII (0xxxxxxx) the boundary is fine
        if (buffer[i].toInt() and 0x80 == 0) return end

        // Walk backwards over continuation bytes (10xxxxxx)
        var continuationCount = 0
        while (i >= 0 && buffer[i].toInt() and 0xC0 == 0x80) {
            continuationCount++
            i--
            // Safety: a UTF-8 char is at most 4 bytes, so max 3 continuations
            if (continuationCount > 3) break
        }

        if (i < 0) {
            // All bytes are continuations with no start byte — corrupted; return as-is
            return end
        }

        // `i` is now at the start byte. Determine expected sequence length.
        val startByte = buffer[i].toInt() and 0xFF
        val expectedLen = when {
            startByte and 0x80 == 0    -> 1 // 0xxxxxxx
            startByte and 0xE0 == 0xC0 -> 2 // 110xxxxx
            startByte and 0xF0 == 0xE0 -> 3 // 1110xxxx
            startByte and 0xF8 == 0xF0 -> 4 // 11110xxx
            else -> 1 // Invalid start byte; treat as 1 to avoid infinite loops
        }

        val actualLen = continuationCount + 1 // start byte + continuations found
        return if (actualLen >= expectedLen) {
            // The character is complete — boundary is fine
            end
        } else {
            // Incomplete character — trim it; the bytes from `i..end-1` are the remainder
            i
        }
    }

    private fun getFileSizeInternal(cr: ContentResolver, uri: Uri): Long {
        return try {
            cr.query(uri, arrayOf(android.provider.OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
                    if (idx >= 0) cursor.getLong(idx) else -1L
                } else -1L
            } ?: -1L
        } catch (_: Exception) { -1L }
    }

    // ── Cleanup on catalyst destroy ─────────────────────────────────────────

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        sessions.values.forEach { session ->
            try { session.stream.close() } catch (_: Exception) {}
        }
        sessions.clear()
    }
}
