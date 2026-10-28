/**
 * Manages polling intervals for each plugin.
 * Supports start, stop, pause, and exponential backoff on errors.
 */
import { useStore } from "@/core/state/store";

interface PollingTask {
    pluginId: string;
    intervalMs: number;
    callback: () => Promise<void>;
    timerId: ReturnType<typeof setTimeout> | null;
    isRunning: boolean;
    /** Incremented on every start/stop so a run still in flight can't reschedule a stale loop */
    generation: number;
    isPaused: boolean;
    errorCount: number;
    maxBackoff: number;
}

class PollingManager {
    private tasks: Map<string, PollingTask> = new Map();

    constructor() {
        this.initStoreSubscription();
    }

    private initStoreSubscription() {
        // Subscribe to store changes to update intervals on the fly
        useStore.subscribe((state, prevState) => {
            if (state.dataConfig.pollingIntervals === prevState.dataConfig.pollingIntervals) return;

            this.tasks.forEach((task, pluginId) => {
                const newInterval = state.dataConfig.pollingIntervals[pluginId];
                if (newInterval && newInterval !== task.intervalMs) {
                    console.log(`[PollingManager] Updating interval for ${pluginId} to ${newInterval}ms`);
                    task.intervalMs = newInterval;
                    // If already running, restart with new interval
                    if (task.isRunning) {
                        this.stop(pluginId);
                        this.start(pluginId);
                    }
                }
            });
        });
    }

    register(
        pluginId: string,
        intervalMs: number,
        callback: () => Promise<void>
    ): void {
        const storeInterval = useStore.getState().dataConfig.pollingIntervals[pluginId];
        this.tasks.set(pluginId, {
            pluginId,
            intervalMs: storeInterval || intervalMs,
            callback,
            timerId: null,
            isRunning: false,
            generation: 0,
            isPaused: false,
            errorCount: 0,
            maxBackoff: 60000, // max 60s backoff
        });
    }

    start(pluginId: string): void {
        const task = this.tasks.get(pluginId);
        if (!task || task.isRunning) return;
        task.isRunning = true;
        const generation = ++task.generation;

        // Each run schedules the next one only after it finishes, so slow
        // requests never overlap and the backoff applies to the next delay
        const run = async () => {
            task.timerId = null;
            if (!task.isPaused) {
                try {
                    await task.callback();
                    task.errorCount = 0;
                } catch (err) {
                    task.errorCount++;
                    console.warn(
                        `[PollingManager] Error in ${pluginId} (attempt ${task.errorCount}):`,
                        err
                    );
                }
            }
            if (task.generation !== generation) return;
            task.timerId = setTimeout(run, this.getEffectiveInterval(task));
        };

        run();
    }

    stop(pluginId: string): void {
        const task = this.tasks.get(pluginId);
        if (!task || !task.isRunning) return;
        task.isRunning = false;
        task.generation++;
        if (task.timerId) clearTimeout(task.timerId);
        task.timerId = null;
        task.errorCount = 0;
    }

    pause(pluginId: string): void {
        const task = this.tasks.get(pluginId);
        if (task) task.isPaused = true;
    }

    resume(pluginId: string): void {
        const task = this.tasks.get(pluginId);
        if (task) {
            task.isPaused = false;
            // Restart with fresh interval if not running
            if (!task.isRunning) {
                this.start(pluginId);
            }
        }
    }

    stopAll(): void {
        this.tasks.forEach((_, pluginId) => this.stop(pluginId));
    }

    unregister(pluginId: string): void {
        this.stop(pluginId);
        this.tasks.delete(pluginId);
    }

    private getEffectiveInterval(task: PollingTask): number {
        if (task.errorCount === 0) return task.intervalMs;
        // Exponential backoff: interval * 2^errorCount, capped at maxBackoff
        const backoff = Math.min(
            task.intervalMs * Math.pow(2, task.errorCount),
            task.maxBackoff
        );
        return backoff;
    }
}

export const pollingManager = new PollingManager();
