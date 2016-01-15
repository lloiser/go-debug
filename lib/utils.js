"use babel";

function toArray(args = []) {
	return [].concat(args);
}

export function log(fn, ...args) {
	if (atom.devMode) {
		console.log(...args); // eslint-disable-line no-console
	}
}

export function catcher() {
	// used to catch promise rejections
	log(arguments);
}

const REGEX_TO_INDEX = /\[[\"\']?(\w+)[\"\']?\]/g;
const REGEX_LEADING_DOT = /^\./;
export function getDeep(o, path) {
	path = path
		// convert indexes to properties (like a["b"]['c'][0])
		.replace(REGEX_TO_INDEX, ".$1")
		// strip a leading dot (as it might occur because of the previous replace)
		.replace(REGEX_LEADING_DOT, "")
		.split(".");

	while (path.length) {
		const n = path.shift();
		if (!(n in o)) {
			return undefined;
		}
		o = o[n];
	}

	return o;
}

export function elementPropInHierarcy(element, prop) {
	const el = eachElementInHierarchy(element, (el) => getDeep(el, prop) !== undefined);
	return getDeep(el, prop);
}

export function eachElementInHierarchy(element, fn) {
	while (element && !fn(element)) {
		element = element.parentElement;
	}
	return element;
}

export function createElement(tag, classes, children) {
	const el = document.createElement(tag);

	classes = toArray(classes);
	if (classes.length) {
		el.classList.add.apply(el.classList, classes);
	}

	function eachChild(c) {
		if (Array.isArray(c)) {
			c.forEach(eachChild);
		} else if (c) {
			if (typeof c === "string") {
				c = document.createTextNode(c);
			}
			el.appendChild(c);
		}
	}
	eachChild(toArray(children));

	return el;
}
