/**
 * Ambient declarations for statically-imported binary assets.
 * React Native's Metro bundler turns these into an opaque numeric asset ref.
 */
declare module '*.jpg' {
  const asset: number;
  export default asset;
}
declare module '*.jpeg' {
  const asset: number;
  export default asset;
}
declare module '*.png' {
  const asset: number;
  export default asset;
}
declare module '*.webp' {
  const asset: number;
  export default asset;
}
