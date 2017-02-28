'use babel'

export function serialize (store) {
  const state = store.getState()
  const mapBP = ({ file, line, cond }) => {
    return { file, line, cond }
  }
  return {
    selectedConfig: state.selectedConfig,
    delve: {
      breakpoints: state.delve.breakpoints.map(mapBP)
    }
  }
}

export function getBreakpoints (store, file) {
  const bps = store.getState().delve.breakpoints
  return !file ? bps : bps.filter((bp) => bp.file === file)
}

export function indexOfBreakpoint (bps, file, line) {
  return bps.findIndex((bp) => bp.file === file && bp.line === line)
}
export function indexOfBreakpointByName (bps, name) {
  return bps.findIndex((bp) => bp.name === name)
}

export function getBreakpoint (store, file, line) {
  const bps = getBreakpoints(store, file)
  const index = indexOfBreakpoint(bps, file, line)
  return index === -1 ? null : bps[index]
}
export function getBreakpointByName (store, name) {
  const bps = getBreakpoints(store)
  const index = indexOfBreakpointByName(bps, name)
  return index === -1 ? null : bps[index]
}
