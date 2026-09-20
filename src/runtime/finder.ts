import { parse } from "lib0/json";
import { JSModule, JSONModule, JSONSourceMap } from "./jsmod";

const defaultDecoder = new TextDecoder();
export abstract class Finder {
    abstract match(url: URL): Finder | undefined;
    abstract stat(url: URL): Promise<boolean>;
    async getBytes(path: URL): Promise<Uint8Array> {
        throw new Error("getBytes() not implemented");
    }
    async getText(path: URL): Promise<string> {
        return defaultDecoder.decode(await this.getBytes(path));
    }
    async getJSON(path: URL): Promise<JSONModule | JSONSourceMap> {
        return parse(await this.getText(path));
    }
    async getImport(path: URL): Promise<JSModule> {
        return await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(await this.getText(path))}`);
    }
}
