'use babel'

import path from 'path'

const REGEX_TO_INDEX = /\[["']?(\w+)["']?]/g
const REGEX_LEADING_DOT = /^\./
export function getDeep (o, path) {
  path = path
    // convert indexes to properties (like a["b"]['c'][0])
    .replace(REGEX_TO_INDEX, '.$1')
    // strip a leading dot (as it might occur because of the previous replace)
    .replace(REGEX_LEADING_DOT, '')
    .split('.')

  var obj = o
  while (obj && path.length) {
    var n = path.shift()
    obj = obj[n]
  }
  return obj
}

export function elementPropInHierarcy (element, prop) {
  const el = eachElementInHierarchy(element, (el) => getDeep(el, prop) !== undefined)
  return getDeep(el, prop)
}

export function eachElementInHierarchy (element, fn) {
  while (element && !fn(element)) {
    element = element.parentElement
  }
  return element
}

export function shortenPath (file) {
  return path.normalize(file).split(path.sep).slice(-2).join(path.sep)
}

export function debounce (func, wait) {
  if (!wait) {
    return func
  }
  let timeout
  const fn = function () {
    const context = this
    const args = arguments
    fn.cancel()
    timeout = setTimeout(() => {
      timeout = null
      func.apply(context, args)
    }, wait)
  }
  fn.cancel = () => clearTimeout(timeout)
  return fn
}

/**
 * Checks if at least the all keys in new props strict equal exist in the old props
 * @param  {Object} [oldProps={}] The old props
 * @param  {Object} [newProps={}] The new props
 * @return {bool}
 */
export function shallowEqual (oldProps = {}, newProps = {}) {
  const newKeys = Object.keys(newProps).sort()
  const oldKeys = Object.keys(oldProps).sort()

  // check if all keys are in the old props
  if (!newKeys.every((key) => oldKeys.includes(key))) {
    return false
  }

  return newKeys.every((key) => newProps[key] === oldProps[key])
}
