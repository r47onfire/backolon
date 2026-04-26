import { LocationTrace, RuntimeError, UNKNOWN_LOCATION } from "../errors";
import { Thing, ThingType, typecheck } from "./thing";

const isMap = typecheck(ThingType.map);

/**
 * Create an empty Backolon map.
 */
export function newEmptyMap(srcLocation = UNKNOWN_LOCATION): Thing<ThingType.map> {
    return new Thing(
        ThingType.map,
        [],
        null,
        "[",
        "]",
        ", ",
        srcLocation,
        false)
}

/**
 * Read a value from a Backolon map by key. The key must be hashable, throws if it's not.
 * Returns undefined if the key is not found.
 */
export function mapGetKey(map: Thing<ThingType.map>, key: Thing, opTrace?: LocationTrace): Thing | undefined {
    if (!isMap(map)){
        throw new RuntimeError("Cannot search non-map", opTrace);
    }
    const pair = mapFindPair(map, key);
    if (pair) return pair.c[1];
}

const childComparator = (a: Thing<ThingType.pair>, b: Thing<ThingType.pair>) => a.c[0]!.h! - b.c[0]!.h!;
/**
 * Add or update the value at the specified key, mutating the map.
 */
export function mapUpdateKeyMutating(map: Thing<ThingType.map>, key: Thing, item: Thing, opTrace?: LocationTrace): void {
    if (!isMap(map)) {
        throw new RuntimeError("Cannot insert into non-map", opTrace);
    }
    const pair = mapFindPair(map, key);
    if (!pair) {
        map.c.push(createNewKVPair(key, item, opTrace));
        map.c.sort(childComparator);
    } else {
        pair.c[1] = item;
    }
}

/**
 * Return a new Backolon map with the given key inserted or updated. The original map is not modified.
 */
export function mapUpdateKeyCopying(map: Thing<ThingType.map>, key: Thing, item: Thing, opTrace?: LocationTrace): Thing<ThingType.map> {
    if (!isMap(map)) {
        throw new RuntimeError("Cannot insert into non-map", opTrace);
    }
    const index = mapFindPairIndex(map, key);
    const newItem = createNewKVPair(key, item, opTrace);
    return copyMapWithNewItems(map, index !== undefined ? map.c.with(index, newItem) : map.c.toSpliced(0, 0, newItem).sort(childComparator));
}

/**
 * Remove a key from a Backolon map by mutating the map. If the key is not present, nothing happens.
 */
export function mapDeleteKeyMutating(map: Thing<ThingType.map>, key: Thing, opTrace?: LocationTrace): void {
    if (!isMap(map)) {
        throw new RuntimeError("Cannot delete from non-map", opTrace);
    }
    const index = mapFindPairIndex(map, key);
    if (index !== undefined) map.c.splice(index, 1);
}

/**
 * Return a new Backolon map without the given key, or the original if the key is already gone.
 */
export function mapDeleteKeyCopying(map: Thing<ThingType.map>, key: Thing, opTrace?: LocationTrace): Thing<ThingType.map> {
    if (!isMap(map)) {
        throw new RuntimeError("Cannot delete from non-map", opTrace);
    }
    const index = mapFindPairIndex(map, key);
    return index !== undefined ? copyMapWithNewItems(map, map.c.toSpliced(index, 1)) : map;
}

function mapFindPairIndex(map: Thing<ThingType.map>, key: Thing, opTrace?: LocationTrace): number | undefined {
    const items = map.c;
    const len = items.length;
    const lm1 = len - 1;
    const targetKeyHash = key.h;
    if (targetKeyHash === null) {
        throw new RuntimeError("unhashable object", opTrace);
    }
    if (len === 0) return;
    var left = 0, right = lm1;
    for (; left <= right;) {
        const probe = left + ((right - left) >> 1);
        const currentKeyHash = items[probe]!.c[0]!.h!;
        if (currentKeyHash === targetKeyHash) {
            // TODO: actually check equality of keys (hash collisions)
            return probe;
        }
        if (currentKeyHash < targetKeyHash) {
            left = probe + 1;
        } else {
            right = probe - 1;
        }
    }
}

function mapFindPair(map: Thing<ThingType.map>, key: Thing, opTrace?: LocationTrace) {
    const index = mapFindPairIndex(map, key, opTrace);
    if (index !== undefined) return map.c[index];
}

function createNewKVPair(key: Thing, value: Thing, opTrace?: LocationTrace) {
    return new Thing(ThingType.pair, [key, value], null, "", "", ": ", opTrace ?? key.loc);
}

function copyMapWithNewItems(map: Thing<ThingType.map>, newItems: Thing<ThingType.pair>[]): Thing<ThingType.map> {
    return new Thing(
        map.t,
        newItems,
        map.v,
        map.s0,
        map.s1,
        map.sj,
        map.loc,
        false);
}
