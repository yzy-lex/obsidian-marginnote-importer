declare module "sql.js" {
	export interface Database {
		exec(sql: string, params?: unknown[]): QueryExecResult[];
		prepare(sql: string): Statement;
		close(): void;
	}

	export interface Statement {
		bind(params?: unknown[]): boolean;
		step(): boolean;
		getAsObject(params?: Record<string, unknown>): Record<string, unknown>;
		free(): boolean;
	}

	export interface QueryExecResult {
		columns: string[];
		values: unknown[][];
	}

	export interface SqlJsStatic {
		Database: new (data?: ArrayLike<number>) => Database;
	}

	export interface InitConfig {
		wasmBinary?: ArrayLike<number>;
		locateFile?: (filename: string) => string;
	}

	export default function initSqlJs(config?: InitConfig): Promise<SqlJsStatic>;
}

declare module "bplist-parser" {
	export function parseBuffer(buffer: Buffer): unknown[];
}
