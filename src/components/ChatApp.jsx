import React, { use, useCallback, useEffect, useRef, useState } from "react";
import { FaUserAlt } from "react-icons/fa";
import { BsCameraVideoFill, BsMicFill } from "react-icons/bs";
import {
  FaVideo,
  FaVideoSlash,
  FaMicrophone,
  FaMicrophoneSlash,
} from "react-icons/fa";

import logo from "/communication.png";

const ChatApp = () => {
  const [username, setUsername] = useState("");
  const [socketId, setSocketId] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [message, setMessage] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [joined, setJoined] = useState(false);
  const [userIsTyaping, setUserIsTyping] = useState(false);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const callerIdRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const [selfMediaControl, setSelfMediaControl] = useState({
    video: true,
    audio: true,
  });
  const [peerMediaControl, setPeerMediaControl] = useState({
    video: true,
    audio: true,
  });

  useEffect(() => {
    if (!joined || !socketRef.current) return;

    const socket = socketRef.current;

    socket.on("connect", () => {
      setSocketId(socket.id);
    });

    socket.on("users_list", (users) => {
      setAllUsers(users.filter((user) => user.id !== socket.id));
    });

    socket.on("private_message", ({ from, senderName, message }) => {
      setChatMessages((prev) => [
        ...prev,
        { from: socket.id, senderName, message },
      ]);
    });

    socket.on("chat_history", (history) => {
      //console.log('chat history listning', history);
      setChatMessages(history);
    });

    let typingTimeout = null;
    socket.on("typing", ({ userId, isTyping }) => {
      clearTimeout(typingTimeout);
      setUserIsTyping({ userId, isTyping });
      typingTimeout = setTimeout(() => {
        setUserIsTyping(false);
      }, 500);
    });

    socket.on("receive_offer", async ({ from, offer }) => {
      console.log("receive_offer", from, offer);
      setIsCallStarted(true);
      // Create a new RTCPeerConnection
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" }, // Free Google STUN server
        ],
      });
      peerConnectionRef.current = peerConnection;
      callerIdRef.current = from;

      // ICE gathering
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice_candidate", {
            to: from,
            candidate: event.candidate,
          });
        }
      };

      // Remote stream
      peerConnection.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        console.log("remote stream", event.streams);
      };

      try {
        const localStream = await getMediaAccess(); // Get local stream
        localStreamRef.current = localStream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        // Add local media tracks to peer connection
        localStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStream);
        });

        // Set remote description (offer from caller)
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        // Process queued ICE candidates
        for (const queuedCandidate of iceCandidateQueueRef.current) {
          try {
            await peerConnection.addIceCandidate(queuedCandidate);
          } catch (error) {
            console.error("Error adding queued ICE candidate", error);
          }
        }
        iceCandidateQueueRef.current = []; // Clear the queue

        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Send the answer to the caller (User A)
        socket.emit("incoming_answer", {
          to: from,
          answer,
        });
      } catch (error) {
        console.error("Error in receive_offer handler:", error);
        setIsCallStarted(false);
      }
    });

    // ICE candidate listener (both sides)
    socket.off("ice_candidate"); // Prevent multiple bindings
    socket.on("ice_candidate", async ({ candidate }) => {
      if (!peerConnectionRef.current || !candidate) return;

      const iceCandidate = new RTCIceCandidate(candidate);

      // Queue the ICE candidate if remote description isn't set
      if (!peerConnectionRef.current.remoteDescription) {
        iceCandidateQueueRef.current.push(iceCandidate);
      } else {
        try {
          await peerConnectionRef.current.addIceCandidate(iceCandidate);
        } catch (error) {
          console.error("Error adding received ICE candidate", error);
        }
      }
    });

    // Handle incoming answer (callee side)
    socket.on("receive_answer", async ({ from, answer }) => {
      console.log("Received answer from:", from);
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      }
    });

    // ICE candidate listener (both sides)
    socket.off("ice_candidate"); // Prevent multiple bindings
    socket.on("ice_candidate", async ({ candidate }) => {
      if (!peerConnectionRef.current || !candidate) return;

      const iceCandidate = new RTCIceCandidate(candidate);

      // Queue the ICE candidate if remote description isn't set
      if (!peerConnectionRef.current.remoteDescription) {
        iceCandidateQueueRef.current.push(iceCandidate);
      } else {
        try {
          await peerConnectionRef.current.addIceCandidate(iceCandidate);
        } catch (error) {
          console.error("Error adding received ICE candidate", error);
        }
      }
    });

    // Handle incoming answer (callee side)
    socket.on("receive_answer", async ({ from, answer }) => {
      console.log("Received answer from:", from);
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      }
    });

    socket.on("call_accepted", ({ from }) => {
      console.log("Call accepted by:", from);
    });

    socket.on("call_rejected", ({ from }) => {
      console.log("Call rejected by:", from);
    });

    socket.on("call_ended", ({ from }) => {
      console.log("Call ended by:", from);
      setIsCallStarted(false);
      peerConnectionRef.current.close();
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
      remoteVideoRef.current.srcObject = null;
    });

    socket.on("media_controller", ({ micEnabled, cameraEnabled }) => {
      setPeerMediaControl({
        video: cameraEnabled,
        audio: micEnabled,
      });

      console.log("media_control changes");
    });

    return () => {
      socket.disconnect();
      clearTimeout(typingTimeout);
      socket.off("private_message");
      socket.off("chat_history");
      socket.off("typing");
      socket.off("receive_offer");
      socket.off("receive_answer");
      socket.off("ice_candidate");
      socket.off("call_accepted");
      socket.off("call_rejected");
      setIsCallStarted(false);
    };
  }, [joined]);

  //handling media controller Change
  useEffect(() => {
    if (socketRef?.current && selectedUser?.id) {
      socketRef.current.emit("media_controller", {
        to: selectedUser.id,
        micEnabled: selfMediaControl.audio,
        cameraEnabled: selfMediaControl.video,
      });
    }
  }, [selfMediaControl.audio, selfMediaControl.video]);

  // handle typing
  useEffect(() => {
    let typingTimeout = null;

    if (socketRef.current && selectedUser && message) {
      socketRef.current.emit("typing", { to: selectedUser.id, isTyping: true });
      //console.log("emiting typing");
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socketRef.current.emit("typing", {
          to: selectedUser.id,
          isTyping: false,
        });
      }, 500);
    }

    return () => {
      clearTimeout(typingTimeout);
    };
  }, [message]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current && isCallStarted) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isCallStarted, remoteVideoRef.current]);

  const getMediaAccess = async () => {
    return await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
  };

  const handleUserSelection = (user) => {
    setSelectedUser(user);
    setMessage("");
    //console.log(user);
    socketRef.current.emit("retrieve_chat_history", user.id);
  };

  const handleSetUsername = async () => {
    if (username.trim() && !joined) {
      const { io } = await import("socket.io-client");
      socketRef.current = io("https://echochat-backend-i6mk.onrender.com");

      socketRef.current.emit("set_username", username);
      setJoined(true);
    }
  };

  const handleSendMessage = () => {
    if (message.trim() && selectedUser && socketRef.current) {
      socketRef.current.emit("private_message", {
        to: selectedUser.id,
        senderName: username,
        message,
      });

      setChatMessages((prev) => [
        ...prev,
        { from: socketRef.current.id, senderName: username, message },
      ]);
      setMessage("");
    }
  };

  const handleLeaveChat = () => {
    socketRef.current.disconnect();
    setJoined(false);
    setAllUsers([]);
    setSelectedUser(null);
    setUsername("");
    setChatMessages([]);
  };

  const handleCallUser = async () => {
    if (!selectedUser) return;

    try {
      setIsCallStarted(true);
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = peerConnection;

      // Get local media stream
      const localStream = await getMediaAccess();
      localStreamRef.current = localStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      // Add local media tracks to peer connection
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("ice_candidate", {
            to: selectedUser.id,
            candidate: event.candidate,
          });
        }
      };

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socketRef.current.emit("incoming_call", {
        to: selectedUser.id,
        offer,
      });
    } catch (error) {
      console.error("Error in handleCallUser:", error);
      setIsCallStarted(false);
    }
  };

  const handleCallEnd = () => {
    peerConnectionRef.current.close();
    setIsCallStarted(false);
    localVideoRef.current.srcObject = null;
    remoteVideoRef.current.srcObject = null;
    localStreamRef.current.getTracks().forEach((track) => {
      track.stop();
    });
    socketRef.current.emit("call_ended", {
      to: selectedUser.id,
    });
  };

  function MediaController({
    mediaController,
    setMediaController,
    isDisabled,
  }) {
    return (
      <div
        style={{
          height: "40px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "rgba(132, 139, 131, 0.5)",
          border: "1px white solid",
          width: "80px",
          gap: "10px",
          borderRadius: "8px",
        }}
      >
        <button
          onClick={() => {
            setMediaController({
              ...mediaController,
              video: !mediaController.video,
            });
          }}
          disabled={isDisabled}
          style={{
            padding: "5px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            background: "transparent",
          }}
        >
          {mediaController.video ? <FaVideo /> : <FaVideoSlash />}
        </button>

        <button
          onClick={() => {
            setMediaController({
              ...mediaController,
              audio: !mediaController.audio,
            });
          }}
          disabled={isDisabled}
          style={{
            padding: "5px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            background: "transparent",
          }}
        >
          {mediaController.audio ? <FaMicrophone /> : <FaMicrophoneSlash />}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "#1f2937",
        width: "100vw",
        height: "100vh",
        color: "white",
        zIndex: "1",
      }}
    >
      {isCallStarted && (
        <div
          style={{
            display: "flex",
            gap: "10px",
            padding: "10px",
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "rgba(128,128,128,0.5)",
            zIndex: "2",
            borderRadius: "8px",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <video
                  ref={localVideoRef}
                  hidden={!selfMediaControl.video}
                  muted={!selfMediaControl.audio}
                  autoPlay
                  playsInline
                  style={{ width: "300px", borderRadius: "8px" }}
                />
                {!selfMediaControl.video && (
                  <div
                    style={{
                      width: "300px",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <FaVideoSlash size={40} />
                  </div>
                )}
                <MediaController
                  mediaController={selfMediaControl}
                  setMediaController={setSelfMediaControl}
                  isDisabled={false}
                />
                <p style={{ fontWeight: "bold", textAlign: "center" }}>You</p>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <video
                  ref={remoteVideoRef}
                  hidden={!peerMediaControl.video}
                  muted={!peerMediaControl.audio}
                  autoPlay
                  playsInline
                  style={{ width: "300px", borderRadius: "8px" }}
                />
                {!peerMediaControl.video && (
                  <div
                    style={{
                      width: "300px",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <FaVideoSlash size={40} />
                  </div>
                )}
                <MediaController
                  mediaController={peerMediaControl}
                  setMediaController={setPeerMediaControl}
                  isDisabled={true}
                />
                <p style={{ fontWeight: "bold", textAlign: "center" }}>
                  {selectedUser.username}
                </p>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <button
                onClick={handleCallEnd}
                style={{
                  backgroundColor: "#ff3e4e",
                  color: "white",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  width: "200px",
                }}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
      {!joined ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
              <img
                src={logo}
                alt="logo"
                style={{ width: "30px", height: "30px" }}
              />
              <h2>Welcome To Echo Chat</h2>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <input
                style={{
                  fontSize: "15px",
                  height: "25px",
                  width: "300px",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid gray",
                }}
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <button
                onClick={handleSetUsername}
                disabled={!username}
                style={{
                  backgroundColor: !username ? "gray" : "#3b82f6",
                  color: "white",
                  padding: "10px 15px",
                  borderRadius: "6px",
                  fontSize: "15px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Join Chat
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", height: "100%" }}>
          {/* Online Users List view */}
          <aside
            style={{
              width: "250px",
              borderRight: "1px solid gray",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "10px",
              backgroundColor: "#111827",
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: "18px",
                  marginBottom: "10px",
                  color: "white",
                  textShadow: "2px 2px 4px black",
                }}
              >
                <strong>Online Users</strong>
              </h3>
              {allUsers.map((user) => (
                <div
                  key={user.id}
                  style={{
                    padding: "8px",
                    marginBottom: "6px",
                    justifyContent: "space-between",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background:
                      selectedUser?.id === user.id ? "gray" : "transparent",
                  }}
                  onClick={() => handleUserSelection(user)}
                >
                  <div style={{ color: "white" }}>
                    <FaUserAlt /> {user.username}
                  </div>
                  {userIsTyaping?.userId === user.id &&
                    userIsTyaping?.isTyping && (
                      <div
                        style={{
                          color: "white",
                          fontSize: "10px",
                          background: "green",
                          border: "1px solid white",
                          padding: "4px",
                          borderRadius: "4px",
                        }}
                      >
                        Typing...
                      </div>
                    )}
                </div>
              ))}
            </div>
            <div
              style={{
                justifyContent: "space-between",
                fontSize: "16px",
                opacity: 0.7,
                color: "lightgray",
                border: "1px solid gray",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                padding: "4px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <FaUserAlt style={{ margin: "4px" }} />
                <strong style={{ color: "white" }}>{username}</strong>
              </div>
              <button
                style={{
                  backgroundColor: "red",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  padding: "8px",
                  fontSize: "16px",
                  borderRadius: "6px",
                }}
                onClick={handleLeaveChat}
              >
                Leave Chat
              </button>
            </div>
          </aside>

          {/* Text Message View */}
          <section
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: "10px",
              position: "relative",
            }}
          >
            <header
              style={{
                fontSize: "18px",
                marginBottom: "10px",
                fontWeight: "bold",
                borderBottom: "1px solid gray",
                paddingBottom: "8px",
              }}
            >
              {selectedUser
                ? `Chat with ${selectedUser.username}`
                : "Select a user to chat"}
            </header>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                marginBottom: "10px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingRight: "10px",
              }}
            >
              {selectedUser ? (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf:
                        msg.senderName === username ? "flex-end" : "flex-start",
                      backgroundColor:
                        msg.senderName === username ? "purple" : "black",
                      padding: "8px 12px",
                      borderRadius: "12px",
                      color: "white",
                    }}
                  >
                    {msg.message}
                  </div>
                ))
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "14px",
                    opacity: 0.7,
                  }}
                >
                  Select a user to start chatting
                </div>
              )}
            </div>

            {selectedUser && (
              <footer
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <input
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid gray",
                    backgroundColor: "#111827",
                    color: "white",
                  }}
                  placeholder="Type a message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!message || !message?.trim()}
                  style={{
                    backgroundColor:
                      !message || !message?.trim() ? "gray" : "green",
                    padding: "10px",
                    borderRadius: "5px",
                    border: "none",
                    color: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  Send
                </button>
                <button
                  onClick={handleCallUser}
                  style={{
                    backgroundColor: "green",
                    padding: "10px",
                    borderRadius: "5px",
                    border: "none",
                    color: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <BsCameraVideoFill />
                </button>
              </footer>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ChatApp;
