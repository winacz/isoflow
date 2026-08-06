/**
 * Minimal binary heap for the cable router's A*.
 *
 * The `pathfinding` package ships its own finders but cannot carry per-edge
 * costs or a direction-aware state, so the router runs its own search and
 * needs its own priority queue.
 */
export class MinHeap<T> {
  private items: { priority: number; value: T }[] = [];

  get size() {
    return this.items.length;
  }

  push(priority: number, value: T) {
    this.items.push({ priority, value });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;

    const top = this.items[0];
    const last = this.items.pop() as { priority: number; value: T };

    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;

        if (
          left < this.items.length &&
          this.items[left].priority < this.items[smallest].priority
        ) {
          smallest = left;
        }
        if (
          right < this.items.length &&
          this.items[right].priority < this.items[smallest].priority
        ) {
          smallest = right;
        }
        if (smallest === i) break;

        [this.items[smallest], this.items[i]] = [
          this.items[i],
          this.items[smallest]
        ];
        i = smallest;
      }
    }

    return top.value;
  }
}
