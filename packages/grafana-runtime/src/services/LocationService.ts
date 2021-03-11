import { UrlQueryMap, urlUtil } from '@grafana/data';
import * as H from 'history';
import { LocationUpdate } from './LocationSrv';
import { createLogger } from '@grafana/ui';
import { config } from '../config';

/**
 * @alpha
 * A wrapper to help work with browser location and history
 */
export interface LocationService {
  partial: (query: Record<string, any>, replace?: boolean) => void;
  push: (location: H.Path | H.LocationDescriptor<any>) => void;
  replace: (location: H.Path | H.LocationDescriptor<any>, forceRouteReload?: boolean) => void;
  reload: () => void;
  getLocation: () => H.Location;
  getHistory: () => H.History;
  getSearch: () => URLSearchParams;
  getSearchObject: () => UrlQueryMap;

  /**
   * This is from the old LocationSrv interface
   * @deprecated use partial, push or replace instead */
  update: (update: LocationUpdate) => void;
}

/** @internal */
export class HistoryWrapper implements LocationService {
  private readonly history: H.History;

  constructor(history?: H.History) {
    // If no history passed create an in memory one if being called from test
    this.history =
      history || process.env.NODE_ENV === 'test'
        ? H.createMemoryHistory({ initialEntries: ['/'] })
        : H.createBrowserHistory({ basename: config.appSubUrl ?? '/' });

    // For debugging purposes the location service is attached to global _debug variable
    if (process.env.NODE_ENV !== 'production') {
      // @ts-ignore
      let debugGlobal = window['_debug'];
      if (debugGlobal) {
        debugGlobal = {
          ...debugGlobal,
          location: this,
        };
      } else {
        debugGlobal = {
          location: this,
        };
      }
      // @ts-ignore
      window['_debug'] = debugGlobal;
    }

    this.partial = this.partial.bind(this);
    this.push = this.push.bind(this);
    this.replace = this.replace.bind(this);
    this.getSearch = this.getSearch.bind(this);
    this.getHistory = this.getHistory.bind(this);
    this.getLocation = this.getLocation.bind(this);
  }

  getHistory() {
    return this.history;
  }

  getSearch() {
    return new URLSearchParams(this.history.location.search);
  }

  partial(query: Record<string, any>, replace?: boolean) {
    const currentLocation = this.history.location;
    const newQuery = this.getSearchObject();

    for (const key of Object.keys(query)) {
      // removing params with null | undefined
      if (query[key] === null || query[key] === undefined) {
        delete newQuery[key];
      } else {
        newQuery[key] = query[key];
      }
    }

    const updatedUrl = urlUtil.renderUrl(currentLocation.pathname, newQuery);

    if (replace) {
      this.history.replace(updatedUrl);
    } else {
      this.history.push(updatedUrl);
    }
  }

  push(location: H.Path | H.LocationDescriptor) {
    this.history.push(location);
  }

  replace(location: H.Path | H.LocationDescriptor, forceRouteReload?: boolean) {
    const state = forceRouteReload ? { forceRouteReload: true } : undefined;

    if (typeof location === 'string') {
      this.history.replace(location, state);
    } else {
      this.history.replace({
        ...location,
        state,
      });
    }
  }

  reload() {
    this.history.replace({
      ...this.history.location,
      state: { forceRouteReload: true },
    });
  }

  getLocation() {
    return this.history.location;
  }

  getSearchObject() {
    return locationSearchToObject(this.history.location.search);
  }

  /** @depecreated */
  update(options: LocationUpdate) {
    if (options.partial && options.query) {
      this.partial(options.query, options.partial);
    } else if (options.replace) {
      this.replace(options.path!);
    } else {
      this.push(options.path!);
    }
  }
}

/**
 * @alpha
 * Parses a location search string to an object
 * */
export function locationSearchToObject(search: string | number): UrlQueryMap {
  let queryString = typeof search === 'number' ? String(search) : search;

  if (queryString.length > 0) {
    if (queryString.startsWith('?')) {
      return urlUtil.parseKeyValue(queryString.substring(1));
    }
    return urlUtil.parseKeyValue(queryString);
  }

  return {};
}

/**
 * @alpha
 */
export let locationService: LocationService = new HistoryWrapper();

/** @internal
 * Used for tests only
 */
export const setLocationService = (location: LocationService) => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('locationService can be only overriden in test environment');
  }
  locationService = location;
};

/** @internal */
export const navigationLogger = createLogger('Router');
