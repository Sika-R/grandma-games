type Listener = (...args: any[]) => void;

class EventBusImpl {
    private listeners = new Map<string, Set<Listener>>();

    on(event: string, fn: Listener) {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(fn);
    }

    off(event: string, fn: Listener) {
        this.listeners.get(event)?.delete(fn);
    }

    emit(event: string, ...args: any[]) {
        const set = this.listeners.get(event);
        if (!set) return;
        // 复制一份，避免 listener 在回调里 off 自己导致迭代异常
        for (const fn of Array.from(set)) {
            try {
                fn(...args);
            } catch (e) {
                console.error(`[EventBus] listener error for ${event}:`, e);
            }
        }
    }

    clear(event?: string) {
        if (event) this.listeners.delete(event);
        else this.listeners.clear();
    }
}

export const EventBus = new EventBusImpl();

// 已知事件名（集中维护，避免拼写错误）
export const Events = {
    COINS_CHANGED: 'currency.coins.changed',
    MINIGAME_ENDED: 'minigame.ended',
    SAVE_LOADED: 'save.loaded',
} as const;
