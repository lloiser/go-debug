"use babel";

import { React } from "react-for-atom";

function convert(text) {
	const root = { tag: "span", style: null, children: [] };
	let el = root;

	const colors = [
		"black", "darkred", "darkgreen", "yellow",             "darkblue", "purple",  "darkcyan", "lightgray",
		"gray",  "red",     "green",     "rgb(255, 255, 224)", "blue",     "magenta", "cyan",     "white"
	];

	function add(tag, style) {
		const newEl = { tag, style, children: [], parent: el };
		el.children.push(newEl);
		el = newEl;
	}

	function close(tag) {
		if (tag !== el.tag) {
			throw new Error("tried to close " + tag + " but was " + el.tag);
		}
		el = el.parent;
	}

	function addFGColor(code) {
		add("span", { color: colors[code] });
	}

	function addBGColor(code) {
		add("span", { backgroundColor: colors[code] });
	}

	function processCode(code) {
		if (code === 0) {
			// reset
			el = root;
		}
		if (code === 1) {
			add("b");
		}
		if (code === 2) {
			// TODO?
		}
		if (code === 4) {
			add("u");
		}
		if ((code > 4 && code < 7)) {
			add("blink");
		}
		if (code === 7) {
			// TODO: fg = bg and bg = fg
		}
		if (code === 8) {
			// conceal - hide...
			add("span", "display: none");
		}
		if (code === 9) {
			add("strike");
		}
		if (code === 10) {
			// TODO: default?
		}
		if (code > 10 && code < 20) {
			// TODO: different fonts?
		}
		if (code === 20) {
			// TODO: fraktur ???
		}
		if (code === 21) {

			if (el.tag === "b") {
				// bold off
				close("b");
			} else {
				// double underline TODO: use border-bottom?
			}
		}
		if (code === 24) {
			close("u");
		}
		if (code === 25) {
			close("blink");
		}
		if (code === 26) {
			// "reserved"
		}
		if (code === 27) {
			// image positive = opposite of code 7 -> fg = fg and bg = bg
		}
		if (code === 28) {
			close("span");
		}
		if (code === 29) {
			close("strike");
		}
		if (code > 29 && code < 38) {
			addFGColor(code - 30);
		}
		if (code === 38) {
			// extended FG color (rgb)
		}
		if (code === 39) {
			// TODO: reset FG
			el = root;
		}
		if (code > 39 && code < 48) {
			addBGColor(code - 40);
		}
		if (code === 48) {
			// extended BG color (rgb)
		}
		if (code === 49) {
			// TODO: reset BG
			el = root;
		}
		if (code > 89 && code < 98) {
			addFGColor(code - 90 + 8);
		}
		if (code > 99 && code < 108) {
			addBGColor(code - 100 + 8);
		}
	}

	const tokens = [
		{
			// characters to remove completely
			pattern: /^\x08+/,
			replacer: () => ""
		},
		{
			// replaces the new lines
			pattern: /^\n+/,
			replacer: function newline() {
				el.children.push({ tag: "br" });
				return "";
			}
		},
		{
			// ansi codes
			pattern: /^\x1b\[((?:\d{1,3};?)+|)m/,
			replacer: (m, group) => {
				if (group.trim().length === 0) {
					group = "0";
				}
				group.trimRight(";").split(";").forEach((code) => {
					processCode(+code);
				});
				return "";
			}
		},
		{
			// malformed sequences
			pattern: /^\x1b\[?[\d;]{0,3}/,
			replacer: () => ""
		},
		{
			// catch everything except escape codes and new lines
			pattern: /^([^\x1b\x08\n]+)/,
			replacer: (text) => {
				el.children.push(text);
				return "";
			}
		}
	];

	// replace "&nbsp;" which sometimes gets encoded using codes 194 and 160...
	text = text.replace(/\u00C2([\u00A0-\u00BF])/g, "$1");

	let length = text.length;
	while (length > 0) {
		for (var i = 0; i < tokens.length; i++) {
			const handler = tokens[i];
			const matches = text.match(handler.pattern);
			if (matches) {
				text = text.replace(handler.pattern, handler.replacer);
				break;
			}
		}
		if (text.length === length) {
			break;
		}
		length = text.length;
	}
	return root;
}

export default class Message extends React.Component {
	shouldComponentUpdate(nextProps) {
		return nextProps.message !== this.props.message;
	}
	render() {
		const result = convert(this.props.message);

		function create(el, i) {
			if (typeof el === "string") {
				return React.createElement("span", { key: i }, el);
			}
			const children = el.children ? el.children.map(create) : null;
			return React.createElement(el.tag, { key: i, style: el.style }, children);
		}
		return React.createElement("div", null, create(result, 0));
	}
}
