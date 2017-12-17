/* @flow */

// Function represents thread-scoped function information.
export type DelveFunction = {|
  // Name is the function name.
  name: string,
  value: number,
  type: number,
  goType: number,
|}

export type DelveLocation = {|
  pc: number,
  file: string,
  line: number,
  function: DelveFunction,
|}

// LoadConfig describes how to load values from target's memory
export type DelveLoadConfig = {|
  // FollowPointers requests pointers to be automatically dereferenced.
  followPointers: boolean,
  // MaxVariableRecurse is how far to recurse when evaluating nested types.
  maxVariableRecurse: number,
  // MaxStringLen is the maximum number of bytes read from a string
  maxStringLen: number,
  // MaxArrayValues is the maximum number of elements read from an array, a slice or a map.
  maxArrayValues: number,
  // MaxStructFields is the maximum number of fields read from a struct, -1 will read all fields.
  maxStructFields: number,
|}

// VariableFlags is the type of the Flags field of Variable.
// 1 = VariableEscaped is set for local variables that escaped to the heap
//     The compiler performs escape analysis on local variables, the variables
//     that may outlive the stack frame are allocated on the heap instead and
//     only the address is recorded on the stack. These variables will be
// 2 = VariableShadowed is set for local variables that are shadowed by a
//     variable with the same name in another scope
export type DelveVariableEscaped = 1
export type DelveVariableShadowed = 2
export type DelveVariableFlags = DelveVariableEscaped | DelveVariableShadowed

// Variable describes a variable.
export type DelveVariable = {|
  // Name of the variable or struct member
  name: string,
  // Address of the variable or struct member
  addr: number,
  // Only the address field is filled (result of evaluating expressions like &<expr>)
  onlyAddr: boolean,
  // Go type of the variable
  type: string,
  // Type of the variable after resolving any typedefs
  realType: string,

  flags: DelveVariableFlags,

  kind: number,

  // Strings have their length capped at proc.maxArrayValues, use Len for the real length of a string
  // Function variables will store the name of the function in this field
  value: string,

  // Number of elements in an array or a slice, number of keys for a map, number of struct members for a struct, length of strings
  len: number,
  // Cap value for slices
  cap: number,

  // Array and slice elements, member fields of structs, key/value pairs of maps, value of complex numbers
  // The Name field in this slice will always be the empty string except for structs (when it will be the field name) and for complex numbers (when it will be "real" and "imaginary")
  // For maps each map entry will have to items in this slice, even numbered items will represent map keys and odd numbered items will represent their values
  // This field's length is capped at proc.maxArrayValues for slices and arrays and 2*proc.maxArrayValues for maps, in the circumnstances where the cap takes effect len(Children) != Len
  // The other length cap applied to this field is related to maximum recursion depth, when the maximum recursion depth is reached this field is left empty, contrary to the previous one this cap also applies to structs (otherwise structs will always have all their member fields returned)
  children: (?DelveVariable)[],
  // go-debug note: marked the flow representation as nullable because it can be not available.
  //                We only load all variables up to a certain level, so it might happens that
  //                a nested variable is not available because the max level is reached.

  // Unreadable addresses will have this field set
  unreadable: string,
|}

export type DelveStackframe = DelveLocation & {|
  locals: DelveVariable[],
  arguments: DelveVariable[],
  frameOffset: number,
  err: string,
|}

// Goroutine represents the information relevant to Delve from the runtime's
// internal G structure.
export type DelveGoroutine = {|
  // ID is a unique identifier for the goroutine.
  id: number,
  // Current location of the goroutine
  currentLoc: DelveLocation,
  // Current location of the goroutine, excluding calls inside runtime
  userCurrentLoc: DelveLocation,
  // Location of the go instruction that started this goroutine
  goStatementLoc: DelveLocation,
  // ID of the associated thread for running goroutines
  threadID: number,
|}

// DebuggerCommand is a command which changes the debugger's execution state.
export type DelveDebuggerCommand = {|
  // Name is the command to run.
  name: string,
  // ThreadID is used to specify which thread to use with the SwitchThread
  // command.
  threadID: number,
  // GoroutineID is used to specify which thread to use with the SwitchGoroutine
  // command.
  goroutineID: number,
|}

// Informations about the current breakpoint
export type DelveBreakpointInfo = {|
  stacktrace: DelveStackframe[],
  goroutine: ?DelveGoroutine,
  variables: DelveVariable[],
  arguments: DelveVariable[],
  locals: DelveVariable[],
|}

// Breakpoint addresses a location at which process execution may be
// suspended.
export type DelveBreakpoint = {|
  // ID is a unique identifier for the breakpoint.
  id: number,
  // User defined name of the breakpoint
  name: string,
  // Addr is the address of the breakpoint.
  addr?: number,
  // File is the source file for the breakpoint.
  file: string,
  // Line is a line in File for the breakpoint.
  line: number,
  // FunctionName is the name of the function at the current breakpoint, and
  // may not always be available.
  functionName?: string,

  // Breakpoint condition
  cond?: ?string,

  // tracepoint flag
  continue?: boolean,
  // retrieve goroutine information
  goroutine?: boolean,
  // number of stack frames to retrieve
  stacktrace?: number,
  // expressions to evaluate
  variables?: string[],
  // LoadArgs requests loading function arguments when the breakpoint is hit
  loadArgs?: ?DelveLoadConfig,
  // LoadLocals requests loading function locals when the breakpoint is hit
  loadLocals?: ?DelveLoadConfig,
  // number of times a breakpoint has been reached in a certain goroutine
  hitCount?: { [key: string]: number },
  // number of times a breakpoint has been reached
  totalHitCount?: number,
|}

// Thread is a thread within the debugged process.
export type DelveThread = {|
  // ID is a unique identifier for the thread.
  id: number,
  // PC is the current program counter for the thread.
  pc: number,
  // File is the file for the program counter.
  file: string,
  // Line is the line number for the program counter.
  line: number,
  // Function is function information at the program counter. May be nil.
  function: ?DelveFunction,

  // ID of the goroutine running on this thread
  goroutineID: number,

  // Breakpoint this thread is stopped at
  breakPoint: ?DelveBreakpoint,
  // Informations requested by the current breakpoint
  breakPointInfo: ?DelveBreakpointInfo,
|}

// DebuggerState represents the current context of the debugger.
export type DelveDebuggerState = {|
  // CurrentThread is the currently selected debugger thread.
  currentThread: ?DelveThread,
  // SelectedGoroutine is the currently selected goroutine
  currentGoroutine: ?DelveGoroutine,
  // List of all the process threads
  threads: DelveThread[],
  // NextInProgress indicates that a next or step operation was interrupted by another breakpoint
  // or a manual stop and is waiting to complete.
  // While NextInProgress is set further requests for next or step may be rejected.
  // Either execute continue until NextInProgress is false or call CancelNext
  nextInProgress: boolean,
  // Exited indicates whether the debugged process has exited.
  exited: boolean,
  exitStatus: number,
  // When contains a description of the current position in a recording
  when: string,
|}

export type DelveEvalScope = {|
  goroutineID: number,
  frame: number,
|}

// const (
//   // Continue resumes process execution.
//   continue: = "continue",
//   // Rewind resumes process execution backwards (target must be a recording).
//   rewind: = "rewind",
//   // Step continues to next source line, entering function calls.
//   step: = "step",
//   // StepOut continues to the return address of the current function
//   stepOut: = "stepOut",
//   // SingleStep continues for exactly 1 cpu instruction.
//   stepInstruction: = "stepInstruction",
//   // Next continues to the next source line, not entering function calls.
//   next: = "next",
//   // SwitchThread switches the debugger's current thread context.
//   switchThread: = "switchThread",
//   // SwitchGoroutine switches the debugger's current thread context to the thread running the specified goroutine
//   switchGoroutine: = "switchGoroutine",
//   // Halt suspends the process.
//   halt: = "halt",
// )

// export type DelveAssemblyFlavour number
//
// const (
//   gNUFlavour: = AssemblyFlavour(proc.GNUFlavour),
//   intelFlavour: = AssemblyFlavour(proc.IntelFlavour),
// )

// AsmInstruction represents one assembly instruction at some address
export type DelveAsmInstruction = {|
  // Loc is the location of this instruction
  loc: DelveLocation,
  // Destination of CALL instructions
  destLoc: ?DelveLocation,
  // Text is the formatted representation of the instruction
  text: string,
  // Bytes is the instruction as read from memory
  bytes: number[],
  // If Breakpoint is true a breakpoint is set at this instruction
  breakpoint: boolean,
  // In AtPC is true this is the instruction the current thread is stopped at
  atPC: boolean,
|}

// export type DelveAsmInstructions []AsmInstruction

export type DelveGetVersionIn = {|
|}

export type DelveGetVersionOut = {|
  delveVersion: string,
  apiVersion: number,
|}

export type DelveSetAPIVersionIn = {|
  apiVersion: number,
|}

export type DelveSetAPIVersionOut = {|
|}

export type DelveRegister = {|
  name: string,
  value: string,
|}

// export type DelveRegisters []Register

export type DelveDiscardedBreakpoint = {|
  breakpoint: ?DelveBreakpoint,
  reason: string,
|}

export type DelveCheckpoint = {|
  id: number,
  when: string,
  where: string,
|}
