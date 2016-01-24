"use babel";

import { createElement, eachElementInHierarchy } from "./utils";

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

function camel(s) {
	return s[0].toUpperCase() + s.substr(1);
}

function sorted(arr) {
	return arr.slice().sort((a, b) => {
		if (a.name < b.name)
			return -1;
		if (a.name > b.name)
			return 1;
		return 0;
	});
}

function pathJoin(...ps) {
	return ps.join(".");
}

function getExpandIcon(expanded) {
	return expanded ? "▼" : "▶";
}

function renderNil() {
	return createElement("span", ["constant", "language"], "nil");
}

export default class Variables {
	constructor(element) {
		this.element = element;
		this.expanded = {};

		this.element.addEventListener("click", this.onClick.bind(this), false);
	}

	render(variables) {
		const fragment = document.createDocumentFragment();

		sorted(variables).forEach((v) => {
			fragment.appendChild(
				createElement("li", [], [
					v.name + ": ",
					this.renderVariable(v, { path: v.name, hideType: false })
				])
			);
		});

		this.element.innerHTML = "";
		this.element.appendChild(fragment);
	}

	renderVariable(v, o) {
		if (v.unreadable !== "") {
			return createElement("span", [], "(unreadable " + v.unreadable + ")");
		}

		if (!v.value && v.addr === 0) {
			return createElement("span", [], [shortType(v.type, o), " ", renderNil()]);
		}

		let fn = "render" + camel(KINDS[v.kind]);
		if (fn.startsWith("renderComplex")) {
			fn = "renderComplex";
		}
		else if (!this[fn]) {
			fn = "renderDefault";
		}
		const s = this[fn](v, o);
		return s;
	}

	renderArray(v, o) {
		return this.renderSlice(v, o);
	}
	renderSlice(v, o) {
		const content = [];
		if (o.hideType !== true) {
			content.push(shortType(v.type, o), " ");
		}

		const kind = KINDS[v.kind];
		if (kind === "slice") {
			content.push("(len: ", formatNumber(v.len), ", cap: ", formatNumber(v.cap), ") ");
		}

		content.push("[");
		const children = createElement("ol", [],
			v.children.map((c, i) => {
				return createElement("li", [], this.renderVariable(c, {
					path: pathJoin(o.path, i),
					hideType: true
				}));
			})
		);

		const diff = v.len - v.children.length;
		if (diff > 0) {
			children.appendChild(createElement("li", [], "... +" + diff + " more"));
		}

		const expander = this.renderExpander(o.path);
		content.push(expander, children, "]");
		this.updateExpandState(o.path, children, expander);

		return content;
	}

	renderPtr(v, o) {
		const child = v.children[0];
		if (v.type === "") {
			return renderNil();
		} else if (child.onlyAddr) {
			return ["(", shortType(v.type, o), ")(", formatAddr(child), ")"];
		} else {
			return [
				o.hideType !== true ? "*" : "",
				this.renderVariable(child, { path: pathJoin(o.path, "0"), hideType: o.hideType })
			];
		}
	}

	renderUnsafePointer(v) {
		return ["unsafe.Pointer(", formatAddr(v.children[0]), ")"];
	}

	renderString(v) {
		const content = [
			createElement("span", ["string"], `"${v.value}"`)
		];
		const diff = v.len - v.value.length;
		if (diff > 0) {
			content.push("... +" + diff + " more");
		}
		return content;
	}

	renderChan(v, o) {
		// could also be rendered as struct
		// this.renderStruct(v, o);

		const content = o.hideType !== true ? [shortType(v.type, o), " "] : [];
		if (v.children.length === 0) {
			return content.concat(renderNil());
		} else {
			return content.concat(this.renderVariable(v.children[0]), "/", this.renderVariable(v.children[1]));
		}
	}

	renderStruct(v, o) {
		const diff = v.len - v.children.length;
		if (diff > 0) {
			const content = o.hideType !== true ? ["(*", shortType(v.type, o), ")"] : [];
			return content.concat("(", formatAddr(v), ")");
		}

		const content = [shortType(v.type, o), o.hideType !== true ? " {" : "{"];

		const children = createElement("ol", [],
			v.children.map((c, i) => {
				return createElement("li", [], [
					c.name + ": ",
					this.renderVariable(c, { path: pathJoin(o.path, i) })
				]);
			})
		);

		const expander = this.renderExpander(o.path);
		content.push(expander, children, "}");
		this.updateExpandState(o.path, children, expander);

		return content;
	}

	renderInterface(v, o) {
		const content = [];
		const child = v.children[0];
		if (child.kind === 0) { // invalid
			content.push(shortType(v.type, o), " ");
			if (child.addr === 0) {
				content.push(renderNil());
				return content;
			}
		} else if (o.hideType !== true) {
			content.push(shortType(v.type, o), "(", shortType(child.type, o), ") ");
		}
		content.push(this.renderVariable(child, { path: pathJoin(o.path, "0") }));
		return content;
	}

	renderMap(v, o) {
		const content = [shortType(v.type, o), " ["];
		const children = createElement("ol");
		for (let i = 0; i < v.children.length; i += 2) {
			const key = v.children[i];
			const value = v.children[i + 1];

			children.appendChild(
				createElement("li", [], [
					createElement("span", [], this.renderVariable(key, { path: pathJoin(o.path, i) })),
					": ",
					createElement("span", [], this.renderVariable(value, { path: pathJoin(o.path, i + 1) }))
				])
			);
		}

		const diff = v.len - v.children.length / 2;
		if (diff > 0) {
			children.appendChild(createElement("li", [], "... +" + diff + " more"));
		}

		const expander = this.renderExpander(o.path);
		content.push(expander, children, "]");
		this.updateExpandState(o.path, children, expander);

		return content;
	}

	renderFunc(v) {
		return v.value ? shortType(v.value) : renderNil();
	}

	renderComplex(v) {
		return [
			"(",
			this.renderVariable(v.children[0]),
			" + ",
			this.renderVariable(v.children[1]),
			"i)"
		];
	}

	renderDefault(v) {
		let classes;
		const kind = KINDS[v.kind];
		if (v.value) {
			if (kind.match(NUMERIC_REGEX)) {
				classes = ["constant", "numeric"];
			} else if (kind === "bool") {
				classes = ["constant", "language"];
			}
		}
		return createElement("span", classes, v.value || "(unknown " + KINDS[v.kind] + ")");
	}

	renderExpander(path) {
		const expanded = !!this.expanded[path];
		const el = createElement("span", ["expander"], getExpandIcon(expanded));
		el.dataset.path = path;
		return el;
	}

	// DOM events

	onClick(ev) {
		const target = eachElementInHierarchy(ev.target, (el) => el.classList.contains("expander"));
		if (!target) {
			return;
		}

		const { path } = target.dataset;

		this.expanded[path] = !this.expanded[path];

		this.updateExpandState(path, target.nextElementSibling, target);
	}

	// helper

	updateExpandState(path, list, expander) {
		const expanded = !!this.expanded[path];
		list.classList.toggle("expanded", expanded);
		expander.textContent = getExpandIcon(expanded);
	}
}

function shortType(type, o = {}) {
	if (o.hideType === true) {
		return undefined;
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
		type= type.substring(1);
	}
	t += type.split("/").pop();
	return t;
}
function formatNumber(value) {
	return createElement("span", ["constant", "numeric"], value + "");
}
function formatAddr(v) {
	return formatNumber("0x" + v.addr.toString(16));
}
