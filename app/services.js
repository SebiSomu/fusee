import { InjectionToken, signal } from '../framework/index.js'

export class LoggerService {
    constructor() {
        this.id = Math.random().toString(36).substr(2, 9);
        this.logs = signal([]);
    }

    log(message) {
        console.log(`[Logger ${this.id}] ${message}`);
        this.logs([...this.logs(), { time: new Date().toLocaleTimeString(), message }]);
    }
}

export const APP_CONFIG = new InjectionToken('app-config');
