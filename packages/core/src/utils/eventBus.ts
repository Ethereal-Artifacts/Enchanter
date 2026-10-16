/**
 * Enchanter - Event Bus
 *
 * Implements a lightweight event system for communication between components:
 * - Provides publish/subscribe (observer) pattern implementation
 * - Handles event registration, emission, and handling
 * - Allows decoupled communication between system components
 * - Supports typed event payloads
 * - Enables clean separation between system modules
 */

// File: utils/eventBus.ts
type EventListener = (data: any) => void;

export class EventBus {
  private events: { [key: string]: EventListener[] };

  constructor() {
    this.events = {};
  }

  on(event: string, listener: EventListener): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  emit(event: string, data: any): void {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(data));
    }
  }
}
