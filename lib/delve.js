"use babel";

import { Emitter } from "atom";
import { spawn } from "child_process";
import rpc from "json-rpc2";
import * as path from "path";
import { log } from "./utils";

const SERVER_URL = "localhost";
const SERVER_PORT = 2345;
const RPC_ENDPOINT = "RPCServer.";

const COMMANDS = {
	continue: "continue",
	next: "next",
	step: "step",
	switchGoroutine: "switchGoroutine"
};

let process;

export default class Delve {
	static runPackageTests(file) {
		return Delve.run(file, "test");
	}

	static runPackage(file) {
		return Delve.run(file, "debug");
	}

	static run(file, method) {
		return new Promise((resolve, reject) => {
			if (process) {
				return;
			}

			const args = [method, "--headless=true", `--listen=${SERVER_URL}:${SERVER_PORT}`, "--log"];
			const cmd = atom.config.get("go-debug.delvePath");
			process = spawn(cmd, args, {
				cwd: path.dirname(file)
			});

			let rpcClient;
			let delve;
			process.stderr.on("data", (chunk) => {
				log("stderr data:", chunk.toString());
				if (!rpcClient) {
					rpcClient = rpc.Client.$create(SERVER_PORT, SERVER_URL);
					rpcClient.connectSocket((err, conn) => {
						if (err) {
							process.kill();
							reject(err);
							return;
						}
						delve = new Delve(process, conn);
						resolve(delve);
					});
				}
			});

			const done = (err) => {
				if (!delve) {
					process = null;
					reject(err);
				}
			};
			process.on("close", (code) => {
				const msg = `delve closed with code ${code}`;
				log(msg);
				done(msg);
			});
			process.on("error", (err) => {
				log("error:", err);
				done(err);
			});
		});
	}

	constructor(process, connection) {
		this.process = process;
		this.connection = connection;
		this.emitter = new Emitter();
		this.state = null;
		this.stacktrace = [];
		this.goroutines = [];
		this.breakpoints = {};
		this.destroyed = false;

		process.stdout.on("data", (chunk) => {
			this.emitter.emit("did-write-to-stdout", chunk.toString());
		});
		process.on("close", () => this.done());
		process.on("error", (err) => this.done(err));
	}

	destroy() {
		if (this.destroyed) {
			return;
		}
		// kill/end everything
		this.connection.end();
		this.emitter.dispose();
		this.destroyed = true;

		// also kill the process
		process.kill();
		process = null;
	}

	// returns the state of the breakpoint at the given file and line
	breakpointAt(file, line) {
		const key = file + "|" + line;
		return !!this.breakpoints[key];
	}

	// API

	createBreakpoint(file, line) {
		const key = file + "|" + line;
		const existingBp = this.breakpoints[key];
		if (existingBp) {
			// breakpoint already exists
			return Promise.resolve();
		}

		// note: delve requires 1 indexed line numbers whereas atom has 0 indexed
		return this.call("CreateBreakpoint", { file, line: line + 1 }).then((response) => {
			this.breakpoints[key] = response;
		});
	}

	clearBreakpoint(file, line) {
		const key = file + "|" + line;
		const dlvBp = this.breakpoints[key];
		delete this.breakpoints[key];
		if (!dlvBp) {
			// either already deleted or not approved by delve yet
			// -> anyway delete and inform everyone
			return Promise.resolve();
		}

		return this.call("ClearBreakpoint", dlvBp.id).then(() => {
			delete this.breakpoints[key];
		});
	}

	continue() {
		return this.call("Command", { name: COMMANDS.continue }).then(this.setState.bind(this));
	}

	next() {
		return this.call("Command", { name: COMMANDS.next }).then(this.setState.bind(this));
	}

	step() {
		return this.call("Command", { name: COMMANDS.step }).then(this.setState.bind(this));
	}

	restart() {
		return this.call("Restart", []).then(this.setState.bind(this, null));
	}

	getStacktrace() {
		if (!this.state || this.isDone()) {
			this.stacktrace = [];
			return Promise.resolve();
		}

		const args = {
			id: this.getGoroutineID(),
			depth: 20,
			full: true
		};
		return this.call("StacktraceGoroutine", args).then((stacktrace) => {
			this.stacktrace = stacktrace;
		});
	}

	getGoroutines() {
		return this.call("ListGoroutines").then((goroutines) => {
			this.goroutines = goroutines;
		});
	}

	setGoroutine(id) {
		return this.call("Command", { name: COMMANDS.switchGoroutine, goroutineID: id }).then((state) => {
			return this.setState(state);
		});
	}

	call(method, ...args) {
		return new Promise((resolve, reject) => {
			const endpoint = RPC_ENDPOINT + method;
			log("calling %s", endpoint);
			this.connection.call(endpoint, args, (err, result) => {
				if (err) {
					log("called %s - error:", endpoint, err);
					reject(err);
					return;
				}
				log("called %s - result:", endpoint, result);
				resolve(result);
			});
		});
	}

	// callbacks

	setState(state) {
		this.state = state;
		if (this.isDone()) {
			this.done();
			return Promise.resolve();
		}

		return Promise.all([
			this.getStacktrace(),
			this.getGoroutines()
		]);
	}

	// helpers

	done(err) {
		if (this.destroyed) {
			return;
		}
		this.emitter.emit("did-finish", { err });
	}
	isDone() {
		return this.state ? this.state.exited : false;
	}

	getGoroutineID() {
		return this.state.currentGoroutine.id;
	}

	// events

	onDidFinish(callback) {
		this.emitter.on("did-finish", callback);
	}
}
