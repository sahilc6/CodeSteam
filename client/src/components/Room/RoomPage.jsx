import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import toast from "react-hot-toast";
import axios from "axios";
import CollabEditor from "../Editor/CollabEditor";
import Toolbar from "./Toolbar";
import UserList from "./UserList";
import OutputPanel from "./OutputPanel";
import ChatPanel from "./ChatPanel";
import RequestsPanel from "./RequestsPanel";
import AuthModal from "../UI/AuthModal";
import { CODE_SKELETONS } from "../../utils/codeSkeletons";
import { getApiBaseUrl, getWsBaseUrl } from "../../utils/runtimeConfig";

const API = getApiBaseUrl();
const WS = getWsBaseUrl();

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const socketRef = useRef(null);
  const codeRef = useRef("");
  const usernameRef = useRef("");
  const showChatRef = useRef(false);
  const editorRef = useRef(null);
  const isSkeletonRef = useRef(true);
  const languageRef = useRef("javascript");
  const codeMapRef = useRef({
    javascript: "",
    java: "",
    python: "",
  });

  const [status, setStatus] = useState("checking");
  const [access, setAccess] = useState(null);
  const [roomName, setRoomName] = useState("");
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [language, setLanguage] = useState("javascript");
  const [initialContent, setInitialContent] = useState("");
  const [initialRevision, setInitialRevision] = useState(0);
  const [showOutput, setShowOutput] = useState(false);
  const [output, setOutput] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [pendingLanguage, setPendingLanguage] = useState(null);
  const [showLangConfirm, setShowLangConfirm] = useState(false);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) setChatUnreadCount(0);
  }, [showChat]);

  const fetchRoomAccess = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/rooms/${roomId}`, {
        headers: authHeaders(),
      });
      setRoomName(data.name || "");
      setRole(data.role);
      setPendingRequests(data.pendingRequests || []);
      setAllowedUsers(data.allowedUsers || []);
      setAccess({ allowed: true });
      setStatus((current) => (current === "live" ? "live" : "connecting"));
    } catch (err) {
      const data = err.response?.data || {};
      setRoomName(data.name || "");
      setAccess({ allowed: false, status: data.accessStatus });
      if (data.accessStatus === "request-needed") setStatus("request");
      else if (data.accessStatus === "pending") setStatus("pending");
      else if (data.accessStatus === "ended") {
        toast.success("Room ended");
        navigate("/");
      }
      else if (data.accessStatus === "login-required") setStatus("login");
      else setStatus("error");
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoomAccess();
  }, [fetchRoomAccess]);

  useEffect(() => {
    if (status !== "pending") return undefined;
    const timer = setInterval(fetchRoomAccess, 3000);
    return () => clearInterval(timer);
  }, [fetchRoomAccess, status]);

  useEffect(() => {
    if (!access?.allowed) return undefined;

    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    usernameRef.current = username || "";

    const socket = io(WS, {
      auth: { token, username },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 6,
      reconnectionDelay: 1500,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-room", { roomId });
    });

    socket.on(
      "room-state",
      ({
        content,
        revision,
        language: lang,
        users: roomUsers,
        role: roomRole,
        pendingRequests: requests,
        allowedUsers: members,
      }) => {
        const contentToSet = content || CODE_SKELETONS[lang] || "";

        codeRef.current = contentToSet;
        codeMapRef.current[lang] = contentToSet;

        setInitialContent(contentToSet);
        setInitialRevision(revision || 0);
        setLanguage(lang);
        setUsers(roomUsers || []);
        setRole(roomRole);
        setPendingRequests(requests || []);
        setAllowedUsers(members || []);

        isSkeletonRef.current = false;

        setTimeout(() => {
          editorRef.current?.setContent(contentToSet);
        }, 50);

        setStatus("live");
      },
    );

    socket.on("join-request-created", (request) => {
      setPendingRequests((prev) => {
        if (prev.some((item) => item.userId === request.userId)) return prev;
        return [...prev, request];
      });
      toast(`${request.username} requested access`);
    });

    socket.on("join-request-updated", ({ userId, cancelled, username }) => {
      setPendingRequests((prev) => prev.filter((request) => request.userId !== userId));
      if (cancelled && username) toast(`${username} cancelled their request`);
    });

    socket.on("chat-message", () => {
      if (!showChatRef.current) {
        setChatUnreadCount((count) => count + 1);
      }
    });

    socket.on("joiner-removed", ({ userId }) => {
      setAllowedUsers((prev) => prev.filter((member) => member.userId !== userId));
      setUsers((prev) => prev.filter((user) => user.userId !== userId));
    });

    socket.on("room-access-removed", ({ message }) => {
      toast.error(message || "Access removed");
      setAccess({ allowed: false, status: "request-needed" });
      setStatus("request");
      socket.disconnect();
    });

    socket.on("user-joined", (user) => {
      setUsers((prev) => {
        if (prev.find((u) => u.socketId === user.socketId)) return prev;
        return [...prev, user];
      });
      toast(`${user.username} joined`);
    });

    socket.on("user-left", ({ socketId, username: name }) => {
      setUsers((prev) => prev.filter((u) => u.socketId !== socketId));
      if (name) toast(`${name} left`);
    });

    socket.on("language-change", ({ language: lang, content, revision, changedBy }) => {
      const newCode = content || CODE_SKELETONS[lang] || "";

      codeRef.current = newCode;
      codeMapRef.current[lang] = newCode;

      setLanguage(lang);
      setInitialContent(newCode);
      setInitialRevision(revision || 0);

      isSkeletonRef.current = false;

      setTimeout(() => {
        editorRef.current?.setContent(newCode);
      }, 50);

      toast(`${changedBy} -> ${lang}`);
    });

    socket.on("room-ended", ({ message }) => {
      toast.success(message || "Room ended");
      setEnding(false);
      setTimeout(() => navigate("/"), 800);
    });

    socket.on("room-error", ({ message }) => {
      toast.error(message);
      setEnding(false);
    });

    socket.on("error", ({ message }) => {
      toast.error(message);
      fetchRoomAccess();
    });

    socket.on("connect_error", (err) => {
      setStatus("error");
      toast.error(`Connection error: ${err.message}`);
    });

    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") {
        setStatus("connecting");
        toast("Reconnecting...");
      }
    });

    socket.on("reconnect", () => {
      socket.emit("join-room", { roomId });
    });

    return () => {
      const editorContent = editorRef.current?.getContent?.();
      const currentCode = editorContent || codeRef.current;
      if (currentCode && socket.connected) {
        socket.emit("sync-content", {
          roomId,
          language: languageRef.current,
          content: currentCode,
        });
      }
      socket.disconnect();
    };
  }, [access?.allowed, fetchRoomAccess, navigate, roomId]);

  async function requestAccess() {
    try {
      await axios.post(`${API}/api/rooms/${roomId}/request`, {}, {
        headers: authHeaders(),
      });
      setStatus("pending");
      toast.success("Request sent");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to request access");
    }
  }

  async function decideRequest(userId, allow) {
    try {
      const { data } = await axios.post(
        `${API}/api/rooms/${roomId}/requests/${userId}/${allow ? "allow" : "deny"}`,
        {},
        { headers: authHeaders() },
      );
      setPendingRequests(data.room?.pendingRequests || []);
      setAllowedUsers(data.room?.allowedUsers || []);
      toast.success(allow ? "Joiner allowed" : "Request denied");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update request");
    }
  }

  async function removeJoiner(userId) {
    try {
      const { data } = await axios.delete(
        `${API}/api/rooms/${roomId}/joiners/${userId}`,
        { headers: authHeaders() },
      );
      setAllowedUsers(data.room?.allowedUsers || []);
      setUsers((prev) => prev.filter((user) => user.userId !== userId));
      toast.success("Joiner removed");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to remove joiner");
    }
  }

  const applyLanguageChange = (lang) => {
    const newCode = codeMapRef.current[lang] || CODE_SKELETONS[lang] || "";
    const editorContent = editorRef.current?.getContent?.();
    const currentCode = editorContent || codeRef.current;

    if (currentCode && socketRef.current?.connected) {
      socketRef.current.emit("sync-content", {
        roomId,
        language,
        content: currentCode,
      });
    }

    setLanguage(lang);
    socketRef.current?.emit("language-change", { language: lang });
    setInitialContent(newCode);
    codeRef.current = newCode;
    isSkeletonRef.current = newCode.includes("__SKELETON__");

    setTimeout(() => {
      editorRef.current?.setContent(newCode);
    }, 100);
  };

  const handleLanguageChange = useCallback(
    (lang) => {
      codeMapRef.current[language] = codeRef.current;

      if (!isSkeletonRef.current) {
        setPendingLanguage(lang);
        setShowLangConfirm(true);
        return;
      }

      applyLanguageChange(lang);
    },
    [language],
  );

  const handleCodeChange = useCallback(
    (val) => {
      const newVal = val || "";
      codeRef.current = newVal;
      codeMapRef.current[language] = newVal;

      if (isSkeletonRef.current && newVal && !newVal.includes("__SKELETON__")) {
        isSkeletonRef.current = false;
      }
    },
    [language],
  );

  const handleRun = useCallback(async () => {
    setExecuting(true);
    setShowOutput(true);
    setOutput(null);

    try {
      const { data } = await axios.post(`${API}/api/execute`, {
        code: codeRef.current,
        language,
      });
      setOutput(data);
    } catch (err) {
      setOutput({
        stdout: "",
        stderr: err.response?.data?.error || "Execution failed",
        exitCode: -1,
        executionTime: 0,
      });
    } finally {
      setExecuting(false);
    }
  }, [language]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied");
  }, [navigate, roomId]);

  const handleLeaveRoom = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const handleEndRoom = useCallback(() => {
    if (!socketRef.current) return;
    setEnding(true);
    socketRef.current.emit("end-room");
  }, []);

  function AccessModal({ title, children }) {
    return (
      <div className="min-h-screen bg-editor-bg text-editor-text flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm bg-editor-sidebar border border-editor-border rounded-lg p-5 shadow-2xl">
            <h1 className="text-base font-semibold mb-2">{title}</h1>
            {roomName && <p className="text-xs text-editor-muted mb-4">{roomName}</p>}
            {children}
          </div>
        </div>
      </div>
    );
  }

  async function cancelAccessRequest() {
    try {
      if (status === "pending") {
        await axios.delete(`${API}/api/rooms/${roomId}/request`, {
          headers: authHeaders(),
        });
      }
      navigate("/");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to cancel request");
    }
  }

  if (status === "checking" || status === "connecting") {
    return (
      <div className="h-screen flex items-center justify-center text-editor-muted">
        Connecting...
      </div>
    );
  }

  if (status === "login") {
    return (
      <div className="min-h-screen bg-editor-bg text-editor-text">
        <AuthModal
          onClose={() => navigate("/")}
          onSuccess={fetchRoomAccess}
        />
      </div>
    );
  }

  if (status === "request") {
    return (
      <AccessModal title="Join room">
        <p className="text-sm text-editor-muted mb-4">
          The creator needs to approve you before the room opens.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancelAccessRequest} className="btn-ghost px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button type="button" onClick={requestAccess} className="btn-primary px-3 py-1.5 text-sm">
            Join
          </button>
        </div>
      </AccessModal>
    );
  }

  if (status === "pending") {
    return (
      <AccessModal title="Waiting to be allowed">
        <p className="text-sm text-editor-muted mb-4">
          Waiting to be allowed by the room creator.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={cancelAccessRequest} className="btn-ghost px-3 py-1.5 text-sm">
            Cancel
          </button>
        </div>
      </AccessModal>
    );
  }

  if (status === "error") {
    return (
      <div className="h-screen flex items-center justify-center text-editor-muted">
        Room not found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-editor-bg">
      <Toolbar
        roomId={roomId}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={handleRun}
        onCopyLink={handleCopyLink}
        onLeaveRoom={handleLeaveRoom}
        onEndRoom={handleEndRoom}
        role={role}
        executing={executing}
        ending={ending}
        connected={status === "live"}
        userCount={users.length}
        showOutput={showOutput}
        onToggleOutput={() => setShowOutput((v) => !v)}
        showChat={showChat}
        chatUnreadCount={chatUnreadCount}
        onToggleChat={() => {
          setShowRequests(false);
          setShowChat((v) => {
            const next = !v;
            if (next) setChatUnreadCount(0);
            return next;
          });
        }}
        showRequests={showRequests}
        onToggleRequests={() => {
          setShowChat(false);
          setShowRequests((v) => !v);
        }}
        requestCount={pendingRequests.length}
      />

      <div className="flex flex-1 overflow-hidden">
        <CollabEditor
          ref={editorRef}
          socket={socketRef.current}
          roomId={roomId}
          language={language}
          initialContent={initialContent}
          initialRevision={initialRevision}
          onCodeChange={handleCodeChange}
        />

        {showChat ? (
          <ChatPanel
            socket={socketRef.current}
            roomId={roomId}
            username={usernameRef.current}
            onClose={() => setShowChat(false)}
          />
        ) : showRequests && role === "creator" ? (
          <RequestsPanel
            requests={pendingRequests}
            onDecideRequest={decideRequest}
            onClose={() => setShowRequests(false)}
          />
        ) : (
          <UserList
            users={users}
            role={role}
            allowedUsers={allowedUsers}
            onRemoveJoiner={removeJoiner}
          />
        )}
      </div>

      {showOutput && (
        <OutputPanel
          output={output}
          executing={executing}
          onClose={() => setShowOutput(false)}
          onRun={handleRun}
        />
      )}

      {showLangConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-editor-bg border border-editor-border rounded-lg p-5 w-[320px] shadow-xl">
            <h3 className="text-editor-text text-base font-semibold mb-2">
              Switch language?
            </h3>
            <p className="text-editor-muted text-sm mb-4">
              Your current code will be replaced.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setPendingLanguage(null);
                  setShowLangConfirm(false);
                }}
                className="btn-ghost px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!pendingLanguage) return;
                  applyLanguageChange(pendingLanguage);
                  setPendingLanguage(null);
                  setShowLangConfirm(false);
                }}
                className="btn-primary px-3 py-1.5 text-sm"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
