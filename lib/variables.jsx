"use babel";

/* eslint-disable no-use-before-define */
import { React } from "react-for-atom";
import { connect } from "react-redux";

const expanded = {};

class Variables extends React.Component {
	render() {
		const { stacktrace } = this.props;
		const vars = stacktrace ? stacktrace.Locals.concat(stacktrace.Arguments) : [];
		const children = sorted(vars).map((v) => {
			const { value, children } = factory.variable({ variable: v });
			return { path: v.name, name: v.name, value, children };
		});
		return <div onClick={this.onToggleClick.bind(this)}>
			<Children children={children} fullPath={"root"} />
		</div>;
	}
	onToggleClick(ev) {
		const path = ev.target.dataset.path;
		if (path) {
			expanded[path] = !expanded[path];
			this.forceUpdate();
		}
	}
}

export default connect(
	(state) => {
		return {
			stacktrace: state.delve.stacktrace[state.delve.selectedStacktrace]
		};
	}
)(Variables);

const Variable = (props) => {
	const name = renderValue(props.name);
	const isExpanded = expanded[props.fullPath];
	let toggleClassName = "go-debug-toggle" + (!props.children ? " go-debug-toggle-hidden": "");
	toggleClassName += " icon icon-chevron-" + (isExpanded ? "down" : "right");
	return <li>
		<span className={toggleClassName} data-path={props.fullPath} />
		{props.value ? <span>{name}: {renderValue(props.value)}</span> : <span>{name}</span>}
		{isExpanded ? <Children children={props.children} fullPath={props.fullPath} /> : null}
	</li>;
};

const Children = (props) => {
	const { children, fullPath } = props;
	if (!children || !children.length) {
		return <div />;
	}
	const vars = children.map((c, i) => {
		const ps = Object.assign({ key: i, fullPath: pathJoin(fullPath, c.path) }, c);
		return <Variable {...ps} />;
	});
	return <ol>{vars}</ol>;
};

function renderValue(value) {
	if (Array.isArray(value)) {
		return value.map((v, i) => <span key={i}>{renderValue(v)}</span>);
	}
	if (typeof value === "object" && "value" in value) {
		const v = renderValue(value.value);
		return value.className ? <span className={value.className}>{v}</span> : v;
	}
	return (value === undefined || value === null) ? "" : value;
}

const factory = {
	variable(props) {
		const v = props.variable;
		if (v.unreadable !== "") {
			return { value: `(unreadable ${v.unreadable})` };
		}

		if (!v.value && v.addr === 0) {
			return { value: shortType(v.type, props, nil()) };
		}

		let fn = KINDS[v.kind];
		if (fn.startsWith("complex")) {
			fn = "complex";
		} else if (!factory[fn]) {
			fn = "default";
		}
		return factory[fn](props);
	},
	array(props) {
		return factory.slice(props);
	},
	slice(props) {
		const v = props.variable;
		const children = v.children.map((c, i) => {
			const { value, children } = factory.variable({ variable: c });
			return { path: i, name: formatNumber(i), value, children };
		});

		const diff = v.len - v.children.length;
		if (diff > 0) {
			children.push({ path: "more", name: `... +${diff} more` });
		}

		const kind = KINDS[v.kind];
		const typeInfo = kind === "slice" && ["(len: ", formatNumber(v.len), ", cap: ", formatNumber(v.cap), ")"];
		return {
			value: shortType(v.type, props, typeInfo),
			children
		};
	},
	ptr(props) {
		const v = props.variable;
		const child = v.children[0];
		if (v.type === "") {
			return { value: nil() };
		}

		if (child.onlyAddr) {
			return {
				value: ["(", shortType(v.type, props), ")(", formatAddr(child), ")"]
			};
		}
		const { value, children } = factory.variable({
			variable: child
		});
		return {
			value: ["*", value],
			children
		};
	},
	unsafePointer(props) {
		return {
			value: ["unsafe.Pointer(", formatAddr(props.variable.children[0]), ")"]
		};
	},
	string(props) {
		const v = props.variable;
		const diff = v.len - v.value.length;
		return {
			value: {
				className: "string",
				value: [
					"\"" + v.value + "\"",
					diff > 0 && `... +${diff} more`
				]
			}
		};
	},
	chan(props) {
		// could also be rendered as struct
		// return factory.struct(props);

		const v = props.variable;
		let content;
		if (v.children.length === 0) {
			content = nil();
		} else {
			const c0 = factory.variable({ variable: v.children[0] });
			const c1 = factory.variable({ variable: v.children[1] });
			if (c0.children) {
				console.log(v.children[0]);
			}
			if (c1.children) {
				console.log(v.children[1]);
			}
			content = [c0.value, "/", c1.value];
		}
		return {
			value: shortType(v.type, props, content)
		};
	},
	struct(props) {
		const v = props.variable;
		const type = shortType(v.type, props);
		const diff = v.len - v.children.length;
		if (diff > 0) {
			return {
				value: [
					type && ["(*", type, ")"],
					"(", formatAddr(v), ")"
				]
			};
		}

		const children = v.children.map((c) => {
			const { value, children } = factory.variable({ variable: c });
			return { path: c.name, name: c.name, value, children };
		});
		return {
			value: type,
			children
		};
	},
	interface(props) {
		const v = props.variable;
		const child = v.children[0];
		if (child.kind === 0 && child.addr === 0) {
			return {
				value: shortType(v.type, props, nil())
			};
		}

		// nicer handling for errors
		if (v.type === "error" && child.type === "*struct errors.errorString") {
			return {
				value: [
					"error ",
					factory.variable({ variable:  child.children[0].children[0] }).value
				]
			};
		}

		const { value, children } = factory.variable({ variable: child });
		return {
			value: [shortType(v.type, props, shortType(child.type, props)), value],
			children
		};
	},
	map(props) {
		const v = props.variable;

		const children = [];
		for (let i = 0; i < v.children.length; i += 2) {
			const { value: kv, children: kc } = factory.variable({ variable: v.children[i] });
			const { value: vv, children: vc } = factory.variable({ variable: v.children[i + 1] });
			if (!kc && !vc) {
				children.push({ path: i, name: kv, value: vv });
			} else {
				children.push({
					path: i,
					name: "{ key, value }",
					children: [
						{ path: "key",   name: "key",   value: kv, children: kc },
						{ path: "value", name: "value", value: vv, children: vc }
					]
				});
			}
		}

		const diff = v.len - v.children.length / 2;
		if (diff > 0) {
			children.push({ path: "more", name: `... +${diff} more` });
		}

		return {
			value: shortType(v.type, props),
			children: children
		};
	},
	func(props) {
		const v = props.variable;
		return {
			value: v.value ? shortType(v.value) : nil()
		};
	},
	complex(props) {
		const v = props.variable;
		const { value: v0 } = factory.variable({ variable: v.children[0] });
		const { value: v1 } = factory.variable({ variable: v.children[1] });
		return { value: ["(", v0, v1, "i)"] };
	},
	default(props) {
		const v = props.variable;
		const kind = KINDS[v.kind];
		let className;
		if (v.value) {
			if (kind.match(NUMERIC_REGEX)) {
				className = "constant numeric";
			} else if (kind === "bool") {
				className = "constant language";
			}
		}
		return {
			value: { className, value: v.value || "(unknown " + KINDS[v.kind] + ")" }
		};
	}
};

const NUMERIC_REGEX = /^(u)?(int|float)/;
const KINDS = [
	"invalid",
	"bool",
	"int",
	"int8",
	"int16",
	"int32",
	"int64",
	"uint",
	"uint8",
	"uint16",
	"uint32",
	"uint64",
	"uintptr",
	"float32",
	"float64",
	"complex64",
	"complex128",
	"array",
	"chan",
	"func",
	"interface",
	"map",
	"ptr",
	"slice",
	"string",
	"struct",
	"unsafePointer"
	// total: 27...
];

function shortType(type, o = {}, additional) {
	if (type.startsWith("map[")) {
		// does not work maps with maps:
		// map[map[int]string]float32
		// map[float32]map[int]string
		// map[map[int]string]map[float32]string
		const parts = type.split("]");
		return { value: ["map[", shortType(parts[0].substr(4)), "]", shortType(parts[1]), additional] };
	}
	if (type.startsWith("struct ")) {
		type = type.substr("struct ".length);
	}
	let t = "";
	if (type.startsWith("[")) {
		let closingIndex = type.indexOf("]");
		if (closingIndex >= 0) {
			closingIndex++;
			t = type.substring(0, closingIndex);
			type = type.substring(closingIndex);
		}
	}
	if (type.startsWith("*")) {
		t += "*";
		type = type.substring(1);
	}
	t += type.split("/").pop();
	return { value: [t, additional] };
}
function nil() { return { value: " nil", className: "constant language" }; }
function formatNumber(value) { return { value, className: "constant numeric" }; }
function formatAddr(v) { return formatNumber("0x" + v.addr.toString(16)); }

function sorted(arr) {
	return (arr || []).slice().sort((a, b) => a.name.localeCompare(b.name));
}
function pathJoin(...ps) {
	return ps.join(".");
}
