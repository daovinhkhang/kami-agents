/**
 * KAMI Store — centralized state management replacing 50+ useState calls.
 *
 * Uses React Context + useReducer (zero dependencies beyond React).
 * Pattern: dispatch actions → reducer updates state immutably.
 */

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react"

// ── Types ──

export type KamiChatMessage = {
  role: "user" | "assistant" | "tool" | "system"
  content: string
  tool_calls?: Record<string, any>[]
  content_parts?: any[]
  metadata?: Record<string, any>
  created_at?: string
}

export type TraceStep = {
  index: number
  tool: string
  status: "running" | "done" | "error"
  label: string
}

export type QuickAction = {
  label: string
  description?: string
  kind: string
  tool: string
  args: Record<string, any>
  risk: string
  confirm_required?: boolean
  artifact_id?: string
  session_id?: string
}

export type ConnectionState = "idle" | "connecting" | "streaming" | "reconnecting" | "disconnected" | "completed"

export type KamiState = {
  // Chat
  messages: KamiChatMessage[]
  inputText: string
  connectionState: ConnectionState
  streamId: string | null
  sessionId: string | null

  // Streaming
  streamedText: string
  reasoningText: string
  traceSteps: TraceStep[]

  // Artifact
  artifactId: string | null
  artifactPayload: Record<string, any> | null
  artifactSections: any[]

  // Draft
  draftPayload: any | null
  draftArtifactId: string | null

  // Approval
  pendingApproval: any | null

  // Quick actions
  quickActions: QuickAction[]

  // UI state
  sidebarOpen: boolean
  artifactPanelOpen: boolean
  adminDrawerOpen: boolean
  adminDrawerTab: string
  isVoiceMode: boolean
  isRealtimeVoice: boolean

  // Sessions
  sessions: any[]
  activeSessionId: string | null
  runningSessionIds: string[]

  // Errors
  error: string | null
}

// ── Actions ──

export type KamiAction =
  | { type: "SET_INPUT_TEXT"; text: string }
  | { type: "SET_CONNECTION_STATE"; state: ConnectionState }
  | { type: "SET_STREAM_ID"; streamId: string | null }
  | { type: "SET_SESSION_ID"; sessionId: string }
  | { type: "ADD_MESSAGE"; message: KamiChatMessage }
  | { type: "SET_MESSAGES"; messages: KamiChatMessage[] }
  | { type: "APPEND_TEXT_DELTA"; delta: string }
  | { type: "APPEND_REASONING_DELTA"; delta: string }
  | { type: "SET_TRACE_STEPS"; steps: TraceStep[] }
  | { type: "UPDATE_TRACE_STEP"; step: TraceStep }
  | { type: "SET_ARTIFACT"; artifactId: string | null; payload: Record<string, any> | null }
  | { type: "ADD_ARTIFACT_SECTION"; section: any }
  | { type: "SET_DRAFT"; draft: any | null; artifactId?: string }
  | { type: "SET_PENDING_APPROVAL"; approval: any | null }
  | { type: "SET_QUICK_ACTIONS"; actions: QuickAction[] }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_ARTIFACT_PANEL" }
  | { type: "SET_ADMIN_DRAWER"; open: boolean; tab?: string }
  | { type: "SET_VOICE_MODE"; active: boolean; realtime?: boolean }
  | { type: "SET_SESSIONS"; sessions: any[] }
  | { type: "SET_ACTIVE_SESSION"; sessionId: string | null }
  | { type: "ADD_RUNNING_SESSION"; sessionId: string }
  | { type: "REMOVE_RUNNING_SESSION"; sessionId: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "RESET_TURN" }
  | { type: "RESET_ALL" }

// ── Initial state ──

const initialState: KamiState = {
  messages: [],
  inputText: "",
  connectionState: "idle",
  streamId: null,
  sessionId: null,
  streamedText: "",
  reasoningText: "",
  traceSteps: [],
  artifactId: null,
  artifactPayload: null,
  artifactSections: [],
  draftPayload: null,
  draftArtifactId: null,
  pendingApproval: null,
  quickActions: [],
  sidebarOpen: true,
  artifactPanelOpen: false,
  adminDrawerOpen: false,
  adminDrawerTab: "approvals",
  isVoiceMode: false,
  isRealtimeVoice: false,
  sessions: [],
  activeSessionId: null,
  runningSessionIds: [],
  error: null,
}

// ── Reducer ──

export function kamiReducer(state: KamiState, action: KamiAction): KamiState {
  switch (action.type) {
    case "SET_INPUT_TEXT":
      return { ...state, inputText: action.text }

    case "SET_CONNECTION_STATE":
      return { ...state, connectionState: action.state }

    case "SET_STREAM_ID":
      return { ...state, streamId: action.streamId }

    case "SET_SESSION_ID":
      return { ...state, sessionId: action.sessionId }

    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] }

    case "SET_MESSAGES":
      return { ...state, messages: action.messages }

    case "APPEND_TEXT_DELTA":
      return { ...state, streamedText: state.streamedText + action.delta }

    case "APPEND_REASONING_DELTA":
      return { ...state, reasoningText: state.reasoningText + action.delta }

    case "SET_TRACE_STEPS":
      return { ...state, traceSteps: action.steps }

    case "UPDATE_TRACE_STEP": {
      const steps = state.traceSteps.map((s) =>
        s.index === action.step.index ? action.step : s
      )
      // Add if not found
      if (!steps.find((s) => s.index === action.step.index)) {
        steps.push(action.step)
      }
      return { ...state, traceSteps: steps }
    }

    case "SET_ARTIFACT":
      return {
        ...state,
        artifactId: action.artifactId,
        artifactPayload: action.payload,
        artifactSections: action.payload?.sections || [],
        artifactPanelOpen: !!action.payload,
      }

    case "ADD_ARTIFACT_SECTION":
      return {
        ...state,
        artifactSections: [...state.artifactSections, action.section],
        artifactPanelOpen: true,
      }

    case "SET_DRAFT":
      return {
        ...state,
        draftPayload: action.draft,
        draftArtifactId: action.artifactId || null,
      }

    case "SET_PENDING_APPROVAL":
      return { ...state, pendingApproval: action.approval }

    case "SET_QUICK_ACTIONS":
      return { ...state, quickActions: action.actions }

    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen }

    case "TOGGLE_ARTIFACT_PANEL":
      return { ...state, artifactPanelOpen: !state.artifactPanelOpen }

    case "SET_ADMIN_DRAWER":
      return {
        ...state,
        adminDrawerOpen: action.open,
        adminDrawerTab: action.tab || state.adminDrawerTab,
      }

    case "SET_VOICE_MODE":
      return {
        ...state,
        isVoiceMode: action.active,
        isRealtimeVoice: action.realtime || false,
      }

    case "SET_SESSIONS":
      return { ...state, sessions: action.sessions }

    case "SET_ACTIVE_SESSION":
      return { ...state, activeSessionId: action.sessionId }

    case "ADD_RUNNING_SESSION":
      return {
        ...state,
        runningSessionIds: state.runningSessionIds.includes(action.sessionId)
          ? state.runningSessionIds
          : [...state.runningSessionIds, action.sessionId],
      }

    case "REMOVE_RUNNING_SESSION":
      return {
        ...state,
        runningSessionIds: state.runningSessionIds.filter((id) => id !== action.sessionId),
      }

    case "SET_ERROR":
      return { ...state, error: action.error }

    case "RESET_TURN":
      return {
        ...state,
        streamedText: "",
        reasoningText: "",
        traceSteps: [],
        pendingApproval: null,
        quickActions: [],
        draftPayload: null,
        draftArtifactId: null,
        error: null,
        connectionState: "idle",
      }

    case "RESET_ALL":
      return initialState

    default:
      return state
  }
}

// ── Context ──

const KamiStateContext = createContext<KamiState>(initialState)
const KamiDispatchContext = createContext<Dispatch<KamiAction>>(() => {})

export const KamiProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(kamiReducer, initialState)
  return (
    <KamiStateContext.Provider value={state}>
      <KamiDispatchContext.Provider value={dispatch}>
        {children}
      </KamiDispatchContext.Provider>
    </KamiStateContext.Provider>
  )
}

// ── Hooks ──

export const useKamiState = () => useContext(KamiStateContext)
export const useKamiDispatch = () => useContext(KamiDispatchContext)
