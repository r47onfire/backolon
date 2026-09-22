import { insertionSort } from "@r47onfire/game-math";
import { ErrnoCode, JEBError, Relation } from "@r47onfire/jeb";

export class Constraint<T> {
    constructor(
        public left: T,
        public relation: Relation,
        public right: T,
    ) {
        if (relation === Relation.FALSE || relation === Relation.TRUE) {
            throw new JEBError(ErrnoCode.ERANGE, `Cannot use ${relation === Relation.TRUE ? "TRUE" : "FALSE"} as a comparison relation`);
        }
    }
}

/**
 * Sorts the objects in descending precedence order according to the constraints given.
 * @returns a mapping of item -> index in list for speed
 */
export const sortByConstraints = <T>(items: T[], constraints: readonly Constraint<T>[]) => {
    const precedences = assignPrecedences(items, constraints);
    insertionSort(items, (a, b) => precedences.get(b)! - precedences.get(a)!);
    return new Map(items.map((x, i) => [x, i]));
}


const assignPrecedences = <T>(items: T[], constraints: readonly Constraint<T>[]): Map<T, number> => {
    if (items.length === 0) {
        return new Map();
    }

    // find equivalence classes
    const equivMap = findEquivalenceClasses(items, constraints);

    // build graph
    const { 0: graph, 1: reps } = partitionEqualIslands(constraints, equivMap, items);

    if (hasCycle(graph)) {
        throw new JEBError(ErrnoCode.EDEADLK, "cannot determine total ordering for constraints due to cycle in graph");
    }

    // toposort the representatives
    const sortedOrder = topologicalSort(graph, reps);

    // assign numeric levels
    const repToLevel = new Map<T, number>();
    sortedOrder.forEach((rep, index) => {
        repToLevel.set(rep, index);
    });

    // Map all parselets to their representative's level
    return items.reduce((result, x) => result.set(x, repToLevel.get(equivMap.find(x))!), new Map());
}

const findEquivalenceClasses = <T>(items: T[], constraints: readonly Constraint<T>[]): UnionFind<T> => {
    const uf = new UnionFind(items);

    for (var constraint of constraints) {
        if ((constraint.relation & Relation.EQUAL) !== 0) {
            uf.union(constraint.left, constraint.right);
        }
    }

    return uf;
}

const partitionEqualIslands = <T>(
    constraints: readonly Constraint<T>[],
    equivMap: UnionFind<T>,
    items: T[],
): [graph: Map<T, Set<T>>, reps: Set<T>] => {
    const graph = new Map<T, Set<T>>();
    const reps = new Set<T>();

    // Initialize graph with all representatives in order
    for (var x of items) {
        const rep = equivMap.find(x);
        if (!reps.has(rep)) {
            reps.add(rep);
            graph.set(rep, new Set());
        }
    }

    // Add edges for strict orderings
    for (var constraint of constraints) {
        const leftRep = equivMap.find(constraint.left);
        const rightRep = equivMap.find(constraint.right);

        if (leftRep === rightRep) {
            if (!(constraint.relation & Relation.EQUAL)) {
                throw new JEBError(ErrnoCode.EEXIST, "contradictory constraints found");
            }
            continue;
        }

        if ((constraint.relation & Relation.GREATER) !== 0) {
            graph.get(leftRep)!.add(rightRep);
        }

        if ((constraint.relation & Relation.LESS) !== 0) {
            graph.get(rightRep)!.add(leftRep);
        }
    }

    return [graph, reps];
}

const topologicalSort = <T>(
    graph: Map<T, Set<T>>,
    items: Set<T>,
): T[] => {
    const inDegree = new Map<T, number>();

    // Initialize in-degrees
    for (var rep of items) {
        inDegree.set(rep, 0);
    }

    for (var rep of items) {
        for (var neighbor of graph.get(rep) || []) {
            inDegree.set(neighbor, (inDegree.get(neighbor) || 0) + 1);
        }
    }

    // Kahn's algorithm
    const queue: T[] = [];
    for (var rep of items) {
        if (inDegree.get(rep) === 0) {
            queue.push(rep);
        }
    }

    const result: T[] = [];
    while (queue.length) {
        const node = queue.shift()!;
        result.push(node);

        for (var neighbor of graph.get(node) || []) {
            inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
            if (inDegree.get(neighbor) === 0) {
                queue.push(neighbor);
            }
        }
    }

    return result;
}

class UnionFind<T> {
    #parent = new Map<T, T>();
    #rank = new Map<T, number>();

    constructor(elements: T[]) {

        for (var x of elements) {
            this.#parent.set(x, x);
            this.#rank.set(x, 0);
        }
    }

    find(x: T): T {
        const parent = this.#parent.get(x)!;

        if (parent !== x) {
            // Path compression
            this.#parent.set(x, this.find(parent));
        }

        return this.#parent.get(x)!;
    }

    union(a: T, b: T): void {
        const rootA = this.find(a);
        const rootB = this.find(b);

        if (rootA === rootB) return;

        // Union by rank
        const rankA = this.#rank.get(rootA)!;
        const rankB = this.#rank.get(rootB)!;

        if (rankA < rankB) {
            this.#parent.set(rootA, rootB);
        } else if (rankA > rankB) {
            this.#parent.set(rootB, rootA);
        } else {
            this.#parent.set(rootB, rootA);
            this.#rank.set(rootA, rankA + 1);
        }
    }
}

const hasCycle = <T>(graph: Map<T, Set<T>>): boolean => {
    const visited = new Set<T>();
    const visiting = new Set<T>();

    const recur = (node: T): boolean => {
        visited.add(node);
        visiting.add(node);

        for (var neighbor of graph.get(node) || []) {
            if (!visited.has(neighbor)) {
                if (recur(neighbor)) return true;
            } else if (visiting.has(neighbor)) {
                return true;
            }
        }

        visiting.delete(node);
        return false;
    };

    for (var node of graph.keys()) {
        if (!visited.has(node)) {
            if (recur(node)) return true;
        }
    }

    return false;
}
