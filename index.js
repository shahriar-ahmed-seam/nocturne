/**
 * Application entry point.
 * Registers the root component with React Native's AppRegistry.
 */
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import App from './src/App';

AppRegistry.registerComponent(appName, () => App);
