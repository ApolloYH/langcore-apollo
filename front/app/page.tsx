"use client";

import {
  BrainCircuit,
  Check,
  ChevronDown,
  Clock3,
  LogIn,
  MessageCirclePlus,
  PanelLeft,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserRound
} from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

type AgentModel = {
  id: string;
  name: string;
  provider: "langcore" | "kimi" | "openai";
};

type AgentMode = {
  id: "quick" | "deep";
  name: string;
};

type ThoughtStep = {
  id: string;
  title: string;
  detail: string;
  status: "done" | "running" | "waiting";
};

type ChatStreamEvent =
  | { type: "start"; id: string; model: string }
  | { type: "thought"; thought: ThoughtStep }
  | { type: "approval"; approval: ApprovalItem }
  | { type: "delta"; text: string }
  | { type: "done"; id: string; model: string; content: string }
  | { type: "error"; error: string };

type ApprovalItem = {
  id: string;
  tool: string;
  risk: "low" | "medium" | "high";
  reason: string;
  input: string;
  status?: "pending" | "approved" | "denied";
};

type ActivityItem =
  | { id: string; kind: "thought"; thought: ThoughtStep }
  | { id: string; approval: ApprovalItem; kind: "approval" }
  | { content: string; id: string; kind: "text" };

type Message = {
  activity?: ActivityItem[];
  id: string;
  content: string;
  role: "assistant" | "user";
  approvals?: ApprovalItem[];
  model?: string;
  streaming?: boolean;
  thoughts?: ThoughtStep[];
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

type User = {
  id: number;
  name: string;
};

type WorkspaceInfo = {
  name: string;
  path: string;
};

type SlashCommand = {
  command: string;
  description: string;
};

const fallbackModels: AgentModel[] = [
  { id: "langcore-agent", name: "LangCore Agent", provider: "langcore" },
  { id: "kimi-k2-agent", name: "Kimi K2.6 Agent", provider: "kimi" },
  { id: "chatgpt-agent", name: "ChatGPT Agent", provider: "openai" },
  { id: "openai-agent", name: "OpenAI Agent", provider: "openai" }
];

const agentModes: AgentMode[] = [
  { id: "quick", name: "快速评估" },
  { id: "deep", name: "深度研究" }
];

const slashCommands: SlashCommand[] = [
  { command: "/help", description: "显示可用命令" },
  { command: "/clear", description: "清空当前对话" },
  { command: "/agents", description: "查看多智能体活动" },
  { command: "/skills", description: "列出已安装 Skills" },
  { command: "/skill install", description: "从本地目录安装 Skill" },
  { command: "/yes", description: "切换自动审批模式" },
  { command: "/stream", description: "切换流式输出" },
  { command: "/verbose", description: "切换过程输出" }
];

const conversationsStorageKey = "langcore-conversations-v1";

export default function Home() {
  const [input, setInput] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<AgentModel[]>(fallbackModels);
  const [selectedMode, setSelectedMode] = useState<AgentMode["id"]>("deep");
  const [selectedModel, setSelectedModel] = useState(fallbackModels[0]?.id ?? "langcore-agent");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo>({ name: "LangCore", path: "" });
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/models")
      .then((response) => response.json())
      .then((payload: { models?: AgentModel[] }) => {
        if (active && payload.models?.length) {
          setModels(payload.models);
          setSelectedModel(payload.models[0]?.id ?? selectedModel);
        }
      })
      .catch(() => {
        setModels(fallbackModels);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const storedUser = window.localStorage.getItem("langcore-user");

    if (storedUser) {
      setUser(JSON.parse(storedUser) as User);
    }

    fetch("/api/workspace")
      .then((response) => response.json())
      .then((payload: WorkspaceInfo) => {
        setWorkspace({
          name: payload.name || "LangCore",
          path: payload.path || ""
        });
      })
      .catch(() => {
        setWorkspace({ name: "LangCore", path: "" });
      });
  }, []);

  useEffect(() => {
    const storedConversations = window.localStorage.getItem(conversationsStorageKey);

    if (storedConversations) {
      try {
        const parsed = JSON.parse(storedConversations) as Conversation[];
        setConversations(Array.isArray(parsed) ? parsed : []);
      } catch {
        setConversations([]);
      }
    }

    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (!historyLoaded || !activeConversationId || messages.length === 0) {
      return;
    }

    setConversations((current) => {
      const nextConversation: Conversation = {
        id: activeConversationId,
        title: conversationTitle(messages),
        messages: messages.map((message) => ({ ...message, streaming: false })),
        updatedAt: Date.now()
      };
      const next = [nextConversation, ...current.filter((conversation) => conversation.id !== activeConversationId)]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 40);

      window.localStorage.setItem(conversationsStorageKey, JSON.stringify(next));
      return next;
    });
  }, [activeConversationId, historyLoaded, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  function appendLocalCommandResponse(commandLine: string, content: string) {
    const now = Date.now();
    const conversationId = activeConversationId ?? `conversation-${now}`;
    const userMessage: Message = {
      id: `user-command-${now}`,
      content: commandLine,
      role: "user"
    };
    const assistantMessage: Message = {
      id: `assistant-command-${now}`,
      content,
      role: "assistant",
      model: selectedModel,
      streaming: false
    };

    setInput("");
    setActiveConversationId(conversationId);
    setMessages((current) => [...current, userMessage, assistantMessage]);
  }

  function runSlashCommand(commandLine: string) {
    const normalized = commandLine.trim().replace(/\s+/g, " ").toLowerCase();

    if (!normalized.startsWith("/")) {
      return false;
    }

    if (normalized === "/clear") {
      startNewChat();
      return true;
    }

    if (normalized === "/yes") {
      const nextAutoApprove = !autoApprove;
      setAutoApprove(nextAutoApprove);
      appendLocalCommandResponse(commandLine, nextAutoApprove ? "自动模式已开启。" : "自动模式已关闭。");
      return true;
    }

    if (normalized === "/help") {
      appendLocalCommandResponse(
        commandLine,
        `可用命令：\n\n${slashCommands.map((item) => `- \`${item.command}\`：${item.description}`).join("\n")}`
      );
      return true;
    }

    if (normalized === "/agents") {
      appendLocalCommandResponse(commandLine, "多智能体和工具活动会显示在每条回复上方的 Thought / approval 事件中。");
      return true;
    }

    if (normalized === "/skills") {
      appendLocalCommandResponse(commandLine, "Skills 由后端 Agent 管理。要查看已安装 Skills，可以直接询问：列出已安装 Skills。");
      return true;
    }

    if (normalized === "/stream") {
      appendLocalCommandResponse(commandLine, "当前前端已默认使用流式输出。");
      return true;
    }

    if (normalized === "/verbose") {
      appendLocalCommandResponse(commandLine, "过程输出已默认显示为 Thought、approval 和工具事件。");
      return true;
    }

    if (normalized === "/skill install" || normalized.startsWith("/skill install ")) {
      appendLocalCommandResponse(commandLine, "用法：`/skill install <本地路径或 GitHub repo>`。当前前端暂未接入安装执行。");
      return true;
    }

    appendLocalCommandResponse(commandLine, `未知命令：\`${commandLine}\`。输入 \`/help\` 查看可用命令。`);
    return true;
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();

    if (!question || isLoading) {
      return;
    }

    if (runSlashCommand(question)) {
      return;
    }

    const now = Date.now();
    const conversationId = activeConversationId ?? `conversation-${now}`;
    const userMessage: Message = {
      id: `user-${now}`,
      content: question,
      role: "user"
    };
    const assistantId = `assistant-pending-${now}`;
    const assistantMessage: Message = {
      id: assistantId,
      activity: [],
      content: "",
      role: "assistant",
      model: selectedModel,
      streaming: true,
      thoughts: []
    };

    setInput("");
    setIsLoading(true);
    setActiveConversationId(conversationId);
    setMessages((current) => [...current, userMessage, assistantMessage]);

    const patchAssistant = (updater: (message: Message) => Message) => {
      setMessages((current) => current.map((message) => (message.id === assistantId ? updater(message) : message)));
    };

    const applyStreamEvent = (event: ChatStreamEvent) => {
      if (event.type === "start") {
        patchAssistant((message) => ({ ...message, model: event.model }));
        return;
      }

      if (event.type === "thought") {
        if (!shouldShowThought(event.thought)) {
          return;
        }

        patchAssistant((message) => ({
          ...message,
          activity: [...(message.activity ?? []), { id: event.thought.id, kind: "thought", thought: event.thought }],
          thoughts: [...(message.thoughts ?? []), event.thought]
        }));
        return;
      }

      if (event.type === "approval") {
        const approval = { ...event.approval, status: event.approval.status ?? "pending" };
        patchAssistant((message) => ({
          ...message,
          activity: [...(message.activity ?? []), { approval, id: approval.id, kind: "approval" }],
          approvals: [...(message.approvals ?? []), approval]
        }));
        return;
      }

      if (event.type === "delta") {
        patchAssistant((message) => ({
          ...message,
          activity: appendTextActivity(message.activity ?? [], event.text),
          content: `${message.content}${event.text}`
        }));
        return;
      }

      if (event.type === "done") {
        patchAssistant((message) => ({
          ...message,
          content: event.content || message.content,
          model: event.model,
          streaming: false
        }));
        return;
      }

      patchAssistant((message) => ({
        ...message,
        content: message.content ? `${message.content}\n\n${event.error}` : event.error,
        streaming: false
      }));
    };

    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({ autoApprove, message: question, mode: selectedMode, model: selectedModel }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      if (!response.body) {
        throw new Error("Streaming response is not available");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          applyStreamEvent(JSON.parse(line) as ChatStreamEvent);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        applyStreamEvent(JSON.parse(buffer) as ChatStreamEvent);
      }
    } catch (error) {
      patchAssistant((message) => ({
        ...message,
        content:
          error instanceof Error && error.message
            ? `接口暂时不可用：${error.message}`
            : "接口暂时不可用，请稍后重试。",
        streaming: false
      }));
    } finally {
      setIsLoading(false);
    }
  }

  function startNewChat() {
    if (isLoading) {
      return;
    }
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
  }

  function openConversation(conversation: Conversation) {
    if (isLoading) {
      return;
    }

    setActiveConversationId(conversation.id);
    setMessages(conversation.messages.map((message) => ({ ...message, streaming: false })));
    setInput("");
  }

  function deleteConversation(conversationId: string) {
    setConversations((current) => {
      const next = current.filter((conversation) => conversation.id !== conversationId);
      window.localStorage.setItem(conversationsStorageKey, JSON.stringify(next));
      return next;
    });

    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
    }
  }

  async function answerApproval(approvalId: string, approved: boolean) {
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        activity: message.activity?.map((item) =>
          item.kind === "approval" && item.approval.id === approvalId
            ? { ...item, approval: { ...item.approval, status: approved ? "approved" : "denied" } }
            : item
        ),
        approvals: message.approvals?.map((approval) =>
          approval.id === approvalId ? { ...approval, status: approved ? "approved" : "denied" } : approval
        )
      }))
    );

    const response = await fetch("/api/chat/approval", {
      body: JSON.stringify({ approved, id: approvalId }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    if (!response.ok) {
      setMessages((current) =>
        current.map((message) => ({
          ...message,
          activity: message.activity?.map((item) =>
            item.kind === "approval" && item.approval.id === approvalId
              ? { ...item, approval: { ...item.approval, status: "pending" } }
              : item
          ),
          approvals: message.approvals?.map((approval) =>
            approval.id === approvalId ? { ...approval, status: "pending" } : approval
          )
        }))
      );
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = loginName.trim();
    const password = loginPassword;

    if (!name || !password) {
      return;
    }

    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ action: authMode, name, password }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      const message =
        payload.error === "User already exists"
          ? "这个用户名已注册"
          : payload.error === "Password length is invalid"
            ? "密码长度需要 6 到 72 位"
            : "用户名或密码不正确";
      setAuthError(message);
      return;
    }

    const payload = (await response.json()) as { user: User };
    setUser(payload.user);
    window.localStorage.setItem("langcore-user", JSON.stringify(payload.user));
    setLoginOpen(false);
    setLoginName("");
    setLoginPassword("");
    setAuthError("");
  }

  const hasConversation = messages.length > 0 || isLoading;

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="LangCore navigation">
        <div className="sidebar-top">
          <div className="brand-wrap">
            <button
              className="brand-mark"
              type="button"
              aria-label="工作空间"
              aria-expanded={workspaceOpen}
              onClick={() => setWorkspaceOpen((open) => !open)}
            >
              LC
            </button>
            {workspaceOpen ? (
              <div className="workspace-popover">
                <div className="workspace-menu-label">当前工作空间</div>
                <div className="workspace-menu-name">{workspace.name}</div>
                <div className="workspace-menu-path">{workspace.path || "未读取到工作目录"}</div>
              </div>
            ) : null}
          </div>
          <button
            className="sidebar-icon"
            type="button"
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <PanelLeft size={19} />
          </button>
        </div>

        <button className="new-chat" type="button" onClick={startNewChat}>
          <MessageCirclePlus size={20} />
          <span>新建对话</span>
          <kbd>⌘ K</kbd>
        </button>

        <nav className="sidebar-nav" aria-label="历史记录">
          <button
            className="nav-title"
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <Clock3 size={19} />
            <span>历史记录</span>
            <ChevronDown className="history-chevron" size={17} />
          </button>
          {historyOpen ? (
            <div className="history-list">
              {conversations.length ? (
                conversations.map((conversation) => (
                  <div
                    className={`history-row ${conversation.id === activeConversationId ? "active" : ""}`}
                    key={conversation.id}
                  >
                    <button
                      className="history-item"
                      disabled={isLoading}
                      onClick={() => openConversation(conversation)}
                      title={conversation.title}
                      type="button"
                    >
                      {conversation.title}
                    </button>
                    <button
                      className="history-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteConversation(conversation.id);
                      }}
                      type="button"
                      aria-label={`删除 ${conversation.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="history-empty">暂无历史对话</div>
              )}
            </div>
          ) : null}
        </nav>

        <div className="login-box">
          <button className="login-button" type="button" onClick={() => setLoginOpen(true)}>
            <span className="avatar">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <UserRound size={17} />}
            </span>
            <span>{user?.name ?? "用户登录"}</span>
            <LogIn size={16} />
          </button>
        </div>
      </aside>

      {loginOpen ? (
        <div className="login-modal-backdrop" role="presentation" onMouseDown={() => setLoginOpen(false)}>
          <form className="login-modal" onSubmit={submitLogin} onMouseDown={(event) => event.stopPropagation()}>
            <div className="login-modal-title">LangCore 账户</div>
            <div className="auth-tabs">
              <button
                className={authMode === "login" ? "active" : ""}
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                }}
              >
                登录
              </button>
              <button
                className={authMode === "register" ? "active" : ""}
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError("");
                }}
              >
                注册
              </button>
            </div>
            <label htmlFor="loginName">用户名</label>
            <input
              autoFocus
              id="loginName"
              maxLength={32}
              onChange={(event) => setLoginName(event.target.value)}
              placeholder="输入你的名字"
              value={loginName}
            />
            <label htmlFor="loginPassword">密码</label>
            <input
              id="loginPassword"
              maxLength={72}
              minLength={6}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="输入密码"
              type="password"
              value={loginPassword}
            />
            {authError ? <div className="auth-error">{authError}</div> : null}
            <div className="login-modal-actions">
              <button disabled={!loginName.trim() || !loginPassword} type="submit">
                {authMode === "login" ? "登录" : "注册"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <section className={`workspace ${hasConversation ? "workspace-chat" : "workspace-home"}`}>
        {hasConversation ? (
          <>
            <header className="chat-header">
              <div>
                <h1>{workspace.name}</h1>
              </div>
              <button className="compact-new" type="button" onClick={startNewChat}>
                <Plus size={18} />
                <span>新对话</span>
              </button>
            </header>

            <div className="message-scroll">
              <div className="message-stack">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} onApproval={answerApproval} />
                ))}
                <div ref={endRef} />
              </div>
            </div>

            <Composer
              autoApprove={autoApprove}
              input={input}
              isLoading={isLoading}
              modes={agentModes}
              selectedMode={selectedMode}
              setAutoApprove={setAutoApprove}
              setInput={setInput}
              setSelectedMode={setSelectedMode}
              submitQuestion={submitQuestion}
              variant="dock"
            />
          </>
        ) : (
          <>
            <header className="home-header">
              <div className="workspace-picker">
                <span className="home-model">{workspace.name}</span>
              </div>
            </header>
            <div className="home-content">
              <h1 className="home-prompt">今天有什么计划？</h1>
              <Composer
                autoApprove={autoApprove}
                input={input}
                isLoading={isLoading}
                modes={agentModes}
                selectedMode={selectedMode}
                setAutoApprove={setAutoApprove}
                setInput={setInput}
                setSelectedMode={setSelectedMode}
                submitQuestion={submitQuestion}
                variant="hero"
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Composer(props: {
  autoApprove: boolean;
  input: string;
  isLoading: boolean;
  modes: AgentMode[];
  selectedMode: AgentMode["id"];
  setAutoApprove: (value: boolean) => void;
  setInput: (value: string) => void;
  setSelectedMode: (value: AgentMode["id"]) => void;
  submitQuestion: (event: FormEvent<HTMLFormElement>) => void;
  variant: "dock" | "hero";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashQuery = props.input.startsWith("/") ? props.input.slice(1).trim().toLowerCase() : "";
  const visibleSlashCommands = props.input.startsWith("/")
    ? slashCommands.filter((item) => {
        const haystack = `${item.command} ${item.description}`.toLowerCase();
        return !slashQuery || haystack.includes(slashQuery);
      })
    : [];
  const slashOpen = !slashDismissed && visibleSlashCommands.length > 0;
  const activeSlashIndex = Math.min(slashIndex, Math.max(visibleSlashCommands.length - 1, 0));

  const applySlashCommand = (command: string) => {
    props.setInput(command);
    setSlashDismissed(true);
    setSlashIndex(0);
  };

  return (
    <form className={`composer composer-${props.variant}`} onSubmit={props.submitQuestion}>
      {slashOpen ? (
        <div className={`slash-menu slash-menu-${props.variant}`} role="listbox" aria-label="Slash commands">
          <div className="slash-menu-title">Slash commands</div>
          {visibleSlashCommands.map((item, index) => (
            <button
              className={index === activeSlashIndex ? "active" : ""}
              key={item.command}
              onMouseDown={(event) => {
                event.preventDefault();
                applySlashCommand(item.command);
              }}
              role="option"
              type="button"
              aria-selected={index === activeSlashIndex}
            >
              <span className="slash-command">{item.command}</span>
              <span className="slash-description">{item.description}</span>
            </button>
          ))}
          <div className="slash-menu-hint">↑↓ 选择 · Enter 填入 · Esc 关闭</div>
        </div>
      ) : null}
      <textarea
        aria-label="输入问题"
        onChange={(event) => {
          props.setInput(event.target.value);
          setSlashDismissed(false);
          setSlashIndex(0);
        }}
        onKeyDown={(event) => {
          if (slashOpen && event.key === "ArrowDown") {
            event.preventDefault();
            setSlashIndex((index) => Math.min(index + 1, visibleSlashCommands.length - 1));
            return;
          }

          if (slashOpen && event.key === "ArrowUp") {
            event.preventDefault();
            setSlashIndex((index) => Math.max(index - 1, 0));
            return;
          }

          if (slashOpen && event.key === "Escape") {
            event.preventDefault();
            setSlashDismissed(true);
            setSlashIndex(0);
            return;
          }

          if (slashOpen && event.key === "Enter") {
            event.preventDefault();
            applySlashCommand(visibleSlashCommands[activeSlashIndex]?.command ?? visibleSlashCommands[0]?.command ?? "/");
            return;
          }

          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="有问题，尽管问"
        rows={1}
        value={props.input}
      />

      <div className="composer-actions">
        <label className={`auto-approve ${props.autoApprove ? "active" : ""}`} title="开启后自动批准工具和 worker 调用">
          <input
            checked={props.autoApprove}
            onChange={(event) => props.setAutoApprove(event.target.checked)}
            type="checkbox"
          />
          <ShieldCheck size={15} />
          <span>自动模式</span>
        </label>
        <div className={`mode-picker mode-picker-${props.variant}`}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="mode-trigger"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <BrainCircuit size={16} />
            <span>{props.modes.find((mode) => mode.id === props.selectedMode)?.name ?? "深度研究"}</span>
            <ChevronDown size={14} />
          </button>

          {menuOpen ? (
            <div className="model-menu" role="menu">
              <div className="model-menu-title">模式</div>
              {props.modes.map((mode) => (
                <button
                  className="model-menu-item"
                  key={mode.id}
                  onClick={() => {
                    props.setSelectedMode(mode.id);
                    setMenuOpen(false);
                  }}
                  role="menuitemradio"
                  type="button"
                  aria-checked={props.selectedMode === mode.id}
                >
                  <span>{mode.name}</span>
                  {props.selectedMode === mode.id ? <Check size={16} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className="send-button" disabled={!props.input.trim() || props.isLoading} type="submit" aria-label="发送">
          <Send size={props.variant === "hero" ? 20 : 17} />
        </button>
      </div>
    </form>
  );
}

function MessageBubble({
  message,
  onApproval
}: {
  message: Message;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  const isUser = message.role === "user";

  return (
    <article
      className={`message-row ${isUser ? "message-user" : "message-assistant"} ${
        message.streaming ? "message-streaming" : ""
      }`}
    >
      <div className="message-body">
        {isUser ? null : (
          <ActivityStream
            activity={messageActivity(message)}
            hasResponse={message.content.trim().length > 0}
            isStreaming={message.streaming === true}
            onApproval={onApproval}
          />
        )}
        {isUser ? (
          <div className="message-content">
            {message.content.split("\n").map((line, index) => <p key={`${message.id}-${index}`}>{line}</p>)}
          </div>
        ) : !messageActivity(message).some((item) => item.kind === "text") && message.content ? (
          <div className="message-content">
            <MarkdownContent content={message.content} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ActivityStream({
  activity,
  hasResponse,
  isStreaming,
  onApproval
}: {
  activity: ActivityItem[];
  hasResponse: boolean;
  isStreaming: boolean;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  const visibleActivity = activity.filter(
    (item) => item.kind === "text" || item.kind === "approval" || shouldShowThought(item.thought)
  );

  if (!visibleActivity.length && !isStreaming && !hasResponse) {
    return null;
  }

  return (
    <div className="activity-stream">
      {!visibleActivity.length && isStreaming ? <SyntheticThinkingEvent isStreaming={isStreaming} /> : null}
      {visibleActivity.map((item) =>
        item.kind === "approval" ? (
          <ApprovalCard approval={item.approval} key={item.id} onApproval={onApproval} />
        ) : item.kind === "text" ? (
          <div className="message-content assistant-text" key={item.id}>
            <MarkdownContent content={item.content} />
          </div>
        ) : (
          <ThoughtEvent thought={item.thought} key={item.id} />
        )
      )}
    </div>
  );
}

function SyntheticThinkingEvent({ isStreaming }: { isStreaming: boolean }) {
  return (
    <details className={`thought-event thought-event-${isStreaming ? "running" : "done"}`} open={isStreaming}>
      <summary>
        <span className="thought-caret">▸</span>
        <span className={`thought-dot thought-${isStreaming ? "running" : "done"}`} />
        <span className="thought-event-title">
          {isStreaming ? "Thinking" : "Thought"}
          {isStreaming ? <span className="thinking-dots" /> : null}
        </span>
      </summary>
    </details>
  );
}

function ThoughtEvent({ thought }: { thought: ThoughtStep }) {
  const isActive = thought.status === "running" || thought.status === "waiting";
  const detail = thought.detail.trim();
  const displayTitle = isActive && thought.title.startsWith("思考中") ? "Thinking" : thought.title;
  const showDots = isActive && thought.title.startsWith("思考中");

  if (!detail) {
    return (
      <div className={`thought-event thought-event-${thought.status}`}>
        <div className="thought-event-row">
          <span className={`thought-dot thought-${thought.status}`} />
          <span className="thought-event-title">
            {displayTitle}
            {showDots ? <span className="thinking-dots" /> : null}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`thought-event thought-event-${thought.status}`}>
      <details open={isActive || Boolean(detail)}>
        <summary>
          <span className="thought-caret">▸</span>
          <span className={`thought-dot thought-${thought.status}`} />
          <span className="thought-event-title">
            {displayTitle}
            {showDots ? <span className="thinking-dots" /> : null}
          </span>
        </summary>
        <div className="thought-event-subline">└ {detail}</div>
      </details>
    </div>
  );
}

function ApprovalCard({
  approval,
  onApproval
}: {
  approval: ApprovalItem;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  const status = approval.status ?? "pending";

  return (
    <section className={`approval-card approval-${status}`}>
      <div className="approval-header">
        <div>
          <div className="approval-title">需要审批：{approval.tool}</div>
          <div className="approval-meta">{approval.risk} risk</div>
        </div>
        <span className="approval-state">
          {status === "pending" ? "等待决策" : status === "approved" ? "已批准" : "已拒绝"}
        </span>
      </div>
      <div className="approval-reason">{approval.reason}</div>
      <pre className="approval-input">{approval.input}</pre>
      {status === "pending" ? (
        <div className="approval-actions">
          <button type="button" onClick={() => onApproval(approval.id, false)}>
            拒绝
          </button>
          <button className="primary" type="button" onClick={() => onApproval(approval.id, true)}>
            批准
          </button>
        </div>
      ) : null}
    </section>
  );
}

function messageActivity(message: Message) {
  if (message.activity?.length) {
    return message.activity;
  }

  return [
    ...(message.thoughts ?? []).map((thought): ActivityItem => ({ id: thought.id, kind: "thought", thought })),
    ...(message.approvals ?? []).map((approval): ActivityItem => ({ approval, id: approval.id, kind: "approval" }))
  ];
}

function appendTextActivity(activity: ActivityItem[], delta: string): ActivityItem[] {
  const last = activity.at(-1);

  if (last?.kind === "text") {
    return [...activity.slice(0, -1), { ...last, content: `${last.content}${delta}` }];
  }

  return [
    ...activity,
    { content: delta, id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: "text" }
  ];
}

function shouldShowThought(thought: ThoughtStep) {
  if (thought.title.startsWith("思考中")) {
    return false;
  }

  if (thought.title === "完成思考" || thought.title === "准备调用工具") {
    return false;
  }

  if (thought.detail.startsWith("stop=") || thought.detail.startsWith("可用工具")) {
    return false;
  }

  if (thought.title.endsWith("自动批准")) {
    return false;
  }

  if (thought.title.endsWith("进展") && /^thinking turn \d+/i.test(thought.detail)) {
    return false;
  }

  return true;
}

type MarkdownBlock =
  | { type: "code"; content: string }
  | { type: "heading"; content: string; level: number }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; content: string }
  | { alignments: Array<"center" | "left" | "right">; headers: string[]; rows: string[][]; type: "table" };

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdown(content);

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <pre className="markdown-code" key={index}>
              <code>{block.content}</code>
            </pre>
          );
        }

        if (block.type === "list") {
          return (
            <ul className="markdown-list" key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "heading") {
          const HeadingTag = block.level <= 2 ? "h3" : "h4";
          return <HeadingTag className="markdown-heading" key={index}>{renderInlineMarkdown(block.content)}</HeadingTag>;
        }

        if (block.type === "table") {
          return (
            <div className="markdown-table-wrap" key={index}>
              <table className="markdown-table">
                <thead>
                  <tr>
                    {block.headers.map((header, cellIndex) => (
                      <th className={`align-${block.alignments[cellIndex] ?? "left"}`} key={cellIndex}>
                        {renderInlineMarkdown(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {block.headers.map((_, cellIndex) => (
                        <td className={`align-${block.alignments[cellIndex] ?? "left"}`} key={cellIndex}>
                          {renderInlineMarkdown(row[cellIndex] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <p key={index}>{renderInlineMarkdown(block.content)}</p>;
      })}
    </>
  );
}

function ThoughtProcess({ thoughts }: { thoughts: ThoughtStep[] }) {
  const latest = thoughts.at(-1);
  const latestIndex = thoughts.length - 1;
  const isActive = latest?.status === "running" || latest?.status === "waiting";
  const summary = thoughtSummary(thoughts);

  return (
    <details className="thought-process" open={isActive}>
      <summary>
        <span className="thought-caret">▸</span>
        <span className="thought-summary-title">
          {isActive ? "Thinking" : "Thought"}
          {isActive ? <span className="thinking-dots" /> : null}
        </span>
        <span className="thought-summary-text">{summary}</span>
        {latest ? <span className={`thought-status thought-status-${latest.status}`} /> : null}
      </summary>
      <div className="thought-list">
        {thoughts.map((thought, index) => (
          <div className="thought-step" key={thought.id}>
            <span className={`thought-dot thought-${index === latestIndex ? thought.status : "past"}`} />
            <div>
              <div className="thought-title">{thought.title}</div>
              <div className="thought-detail">{thought.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function conversationTitle(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();

  if (!firstUserMessage) {
    return "新对话";
  }

  return firstUserMessage.length > 28 ? `${firstUserMessage.slice(0, 28)}...` : firstUserMessage;
}

function thoughtSummary(thoughts: ThoughtStep[]) {
  const workerCount = thoughts.filter((thought) => /worker|general-purpose|coder|reviewer/i.test(thought.title)).length;
  const toolCount = thoughts.filter((thought) => thought.title.startsWith("调用工具")).length;
  const waitingCount = thoughts.filter((thought) => thought.status === "waiting").length;
  const latest = thoughts.at(-1);
  const parts = [];

  if (toolCount) {
    parts.push(`${toolCount} tools`);
  }
  if (workerCount) {
    parts.push(`${workerCount} worker events`);
  }
  if (waitingCount) {
    parts.push(`${waitingCount} waiting`);
  }
  if (!parts.length && latest) {
    parts.push(latest.title);
  }

  return parts.join(" · ") || "Agent activity";
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  let table: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", content: paragraph.join(" ") });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };

  const flushTable = () => {
    if (table.length) {
      const parsed = parseMarkdownTable(table);
      if (parsed) {
        blocks.push(parsed);
      } else {
        blocks.push({ type: "paragraph", content: table.map((line) => line.trim()).join(" ") });
      }
      table = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (code) {
        blocks.push({ type: "code", content: code.join("\n") });
        code = null;
      } else {
        flushParagraph();
        flushList();
        flushTable();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch?.[1]) {
      flushParagraph();
      flushTable();
      list.push(listMatch[1]);
      continue;
    }

    const headingMatch = line.match(/^\s*(#{1,4})\s+(.+)$/);
    if (headingMatch?.[1] && headingMatch[2]) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push({ type: "heading", level: headingMatch[1].length, content: headingMatch[2].trim() });
      continue;
    }

    if (isMarkdownTableLine(line)) {
      flushParagraph();
      flushList();
      table.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushTable();

  if (code) {
    blocks.push({ type: "code", content: code.join("\n") });
  }

  return blocks.length ? blocks : [{ type: "paragraph", content }];
}

function isMarkdownTableLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.slice(1, -1).includes("|");
}

function parseMarkdownTable(lines: string[]): Extract<MarkdownBlock, { type: "table" }> | null {
  if (lines.length < 2 || !isMarkdownTableSeparator(lines[1] ?? "")) {
    return null;
  }

  const headers = splitMarkdownTableRow(lines[0] ?? "");
  const alignments = splitMarkdownTableRow(lines[1] ?? "").map(parseTableAlignment);
  if (!headers.length || alignments.length < headers.length) {
    return null;
  }

  const rows = lines.slice(2).map(splitMarkdownTableRow).filter((row) => row.some((cell) => cell.trim()));
  return {
    alignments,
    headers,
    rows,
    type: "table"
  };
}

function isMarkdownTableSeparator(line: string) {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableAlignment(cell: string): "center" | "left" | "right" {
  const trimmed = cell.trim();
  if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
  if (trimmed.endsWith(":")) return "right";
  return "left";
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderInlineMarkdown(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("[")) {
      const label = match[2] ?? "";
      const href = match[3] ?? "";
      nodes.push(
        isSafeMarkdownHref(href) ? (
          <a href={href} key={nodes.length} rel={href.startsWith("http") ? "noreferrer" : undefined} target={href.startsWith("http") ? "_blank" : undefined}>
            {label}
          </a>
        ) : (
          label
        )
      );
    } else if (token.startsWith("`")) {
      nodes.push(<code key={nodes.length}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function isSafeMarkdownHref(href: string) {
  return href.startsWith("/") || href.startsWith("https://") || href.startsWith("http://");
}
