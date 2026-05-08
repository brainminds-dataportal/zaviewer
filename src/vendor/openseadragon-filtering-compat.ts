import OpenSeadragon from "openseadragon";

type FilterProcessor = (
  context: CanvasRenderingContext2D,
  callback: () => void,
) => void;

type FilterTarget = OpenSeadragon.TiledImage | OpenSeadragon.TiledImage[];

interface FilterDefinition {
  items?: FilterTarget;
  processors: FilterProcessor | FilterProcessor[];
}

interface FilterOptions {
  viewer?: OpenSeadragon.Viewer;
  loadMode?: "sync" | "async";
  filters?: FilterDefinition | FilterDefinition[];
}

declare module "openseadragon" {
  interface Viewer {
    filterPluginInstance?: FilterPluginCompat;
    setFilterOptions(options?: FilterOptions): void;
  }
}

class FilterPluginCompat {
  viewer: OpenSeadragon.Viewer;
  filters: Array<FilterDefinition & { processors: FilterProcessor[] }> = [];
  filterIncrement = 0;
  private previousItems = new Set<OpenSeadragon.TiledImage>();

  constructor(options: FilterOptions) {
    if (!options.viewer) {
      throw new Error("A viewer must be specified.");
    }

    this.viewer = options.viewer;
    this.viewer.addHandler("tile-invalidated", this.handleTileInvalidated);
    this.setOptions(options);
  }

  setOptions(options: FilterOptions = {}) {
    const filters = normalizeFilters(options.filters);
    const nextItems = collectItems(this.viewer.world, filters);
    const itemsToInvalidate = new Set<OpenSeadragon.TiledImage>([
      ...this.previousItems,
      ...nextItems,
    ]);

    this.filters = filters;
    this.filterIncrement += 1;
    this.previousItems = nextItems;

    const invalidatePromise = Promise.all(
      [...itemsToInvalidate].map((item) => item.requestInvalidate(true)),
    );

    if (options.loadMode === "sync") {
      void invalidatePromise.finally(() => {
        this.viewer.forceRedraw();
      });
      return;
    }

    void invalidatePromise;
  }

  private handleTileInvalidated = async (
    event: OpenSeadragon.TileInvalidatedEvent,
  ) => {
    const processors = getFilterProcessors(this.filters, event.tiledImage);
    if (processors.length === 0) {
      return;
    }

    const currentIncrement = this.filterIncrement;
    if (await isEventOutdated(event)) {
      return;
    }

    const context = (await event.getData(
      "context2d",
    )) as CanvasRenderingContext2D | null;

    if (!context) {
      return;
    }

    const completed = await runProcessors(context, processors, async () => {
      if (currentIncrement !== this.filterIncrement) {
        return true;
      }

      return isEventOutdated(event);
    });

    if (!completed || currentIncrement !== this.filterIncrement) {
      return;
    }

    if (await isEventOutdated(event)) {
      return;
    }

    await event.setData(context, "context2d");
  };
}

function normalizeFilters(
  filters: FilterOptions["filters"],
): Array<FilterDefinition & { processors: FilterProcessor[] }> {
  if (!filters) {
    return [];
  }

  const normalizedFilters = Array.isArray(filters) ? filters : [filters];
  return normalizedFilters.map((filter) => {
    if (!filter.processors) {
      throw new Error("Filter processors must be specified.");
    }

    return {
      ...filter,
      processors: Array.isArray(filter.processors)
        ? filter.processors
        : [filter.processors],
    };
  });
}

function collectItems(
  world: OpenSeadragon.World,
  filters: Array<FilterDefinition & { processors: FilterProcessor[] }>,
) {
  const items = new Set<OpenSeadragon.TiledImage>();

  for (const filter of filters) {
    if (!filter.items) {
      for (let index = 0; index < world.getItemCount(); index += 1) {
        const item = world.getItemAt(index);
        if (item) {
          items.add(item);
        }
      }
      continue;
    }

    const targets = Array.isArray(filter.items) ? filter.items : [filter.items];
    for (const item of targets) {
      if (items.has(item)) {
        throw new Error("An item can not have filters assigned multiple times.");
      }
      items.add(item);
    }
  }

  return items;
}

function getFilterProcessors(
  filters: Array<FilterDefinition & { processors: FilterProcessor[] }>,
  tiledImage: OpenSeadragon.TiledImage,
) {
  for (const filter of filters) {
    if (!filter.items) {
      return filter.processors;
    }

    if (Array.isArray(filter.items)) {
      if (filter.items.includes(tiledImage)) {
        return filter.processors;
      }
      continue;
    }

    if (filter.items === tiledImage) {
      return filter.processors;
    }
  }

  return [];
}

async function runProcessors(
  context: CanvasRenderingContext2D,
  processors: FilterProcessor[],
  shouldStop: () => Promise<boolean>,
) {
  for (const processor of processors) {
    if (await shouldStop()) {
      return false;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      try {
        processor(context, done);
      } catch (error) {
        settled = true;
        reject(error);
      }
    });
  }

  return !(await shouldStop());
}

async function isEventOutdated(event: OpenSeadragon.TileInvalidatedEvent) {
  return Boolean(await event.outdated());
}

if (!OpenSeadragon.Viewer.prototype.setFilterOptions) {
  OpenSeadragon.Viewer.prototype.setFilterOptions = function setFilterOptions(
    options: FilterOptions = {},
  ) {
    if (!this.filterPluginInstance) {
      this.filterPluginInstance = new FilterPluginCompat({
        ...options,
        viewer: this,
      });
      return;
    }

    this.filterPluginInstance.setOptions(options);
  };
}