/** Source location information for a token. */
export class Span {
    constructor(
        /** URL uniquely identifying the source that this span is from. */
        public readonly file: Readonly<URL>,
        /** Source index at which this span starts. (not line or column.) */
        public readonly start: number,
        /** Source index at which this span ends. */
        public readonly end: number,
    ) {}
}
