'use babel'

export function serialize (store) {
  const state = store.getState()
  const mapBP = ({ file, line }) => {
    return { file, line }
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
export function indexOfBreakpointByID (bps, id) {
  return bps.findIndex((bp) => bp.id === id)
}

export function getBreakpoint (store, file, line) {
  const bps = getBreakpoints(store, file)
  const index = indexOfBreakpoint(bps, file, line)
  return index === -1 ? null : bps[index]
}
export function getBreakpointByID (store, id) {
  const bps = getBreakpoints(store)
  const index = indexOfBreakpointByID(bps, id)
  return index === -1 ? null : bps[index]
}
