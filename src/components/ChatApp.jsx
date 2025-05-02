import React, { useEffect, useRef, useState } from 'react';
import { FaUserAlt, FaPaperPlane } from 'react-icons/fa';
import logo from '/communication.png';

const ChatApp = () => {
  const [username, setUsername] = useState('');
  const [socketId, setSocketId] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [message, setMessage] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [joined, setJoined] = useState(false);
  const [userIsTyaping, setUserIsTyping] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!joined || !socketRef.current) return;

    const socket = socketRef.current;

    socket.on('connect', () => {
      setSocketId(socket.id);
    });

    socket.on('users_list', (users) => {
      setAllUsers(users.filter((user) => user.id !== socket.id));
    });

    socket.on('private_message', ({ from, senderName, message }) => {
      setChatMessages((prev) => [
        ...prev,
        { from: socket.id, senderName, message },
      ]);
    });

    socket.on('chat_history', (history) => {
      //console.log('chat history listning', history);
      setChatMessages(history);
    });

    let typingTimeout = null;
    socket.on('typing', ({userId, isTyping}) => {
      clearTimeout(typingTimeout);
      setUserIsTyping({userId, isTyping});
      typingTimeout = setTimeout(() => {
        setUserIsTyping(false);
      }, 500);
    });

    return () => {
      socket.disconnect();
      clearTimeout(typingTimeout);
    };
  }, [joined]);

  // handle typing
  useEffect(() => {
    let typingTimeout = null;

    if (socketRef.current && selectedUser && message) {
      socketRef.current.emit('typing', { to: selectedUser.id , isTyping: true });
      //console.log("emiting typing");
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socketRef.current.emit('typing', { to: selectedUser.id , isTyping: false });
      }, 500);
    }

    return () => {
      clearTimeout(typingTimeout);
    }
  }, [message]);

  useEffect(() => {
    //console.log(userIsTyaping);
  }, [userIsTyaping]);

  const handleUserSelection = (user) => {
    setSelectedUser(user);
    setMessage('');
    //console.log(user);
    socketRef.current.emit('retrieve_chat_history', user.id);
  };
  

  const handleSetUsername = async () => {
    if (username.trim() && !joined) {
      const { io } = await import('socket.io-client');
      socketRef.current = io('https://echochat-backend-i6mk.onrender.com');

      socketRef.current.emit('set_username', username);
      setJoined(true);
    }
  };

  const handleSendMessage = () => {
    if (message.trim() && selectedUser && socketRef.current) {
      socketRef.current.emit('private_message', {
        to: selectedUser.id,
        senderName: username,
        message,
      });

      setChatMessages((prev) => [
        ...prev,
        { from: socketRef.current.id , senderName: username, message },
      ]);
      setMessage('');
    }
  };

  const handleLeaveChat = ()=>{
    socketRef.current.disconnect();
    setJoined(false);
    setAllUsers([]);
    setSelectedUser(null);
    setUsername('');
    setChatMessages([]);
  }

  return (
    <div style={{ backgroundColor: '#1f2937' , width: '100vw', height: '100vh', color: 'white'}}>
      {!joined ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' , justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <img
              src={logo}
              alt="logo"
              style={{ width: '30px', height: '30px' }}
            />
            <h2>Welcome To Echo Chat</h2>
            </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              style={{
                fontSize:"15px",
                height: '25px',
                width: '300px',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid gray',
              }}
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button
              onClick={handleSetUsername}
              disabled={!username}
              style={{
                backgroundColor: !username ? 'gray' : '#3b82f6',
                color: 'white',
                padding: '10px 15px',
                borderRadius: '6px',
                fontSize: "15px",
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Join Chat
            </button>
          </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', height: '100%' }}>
          {/* Online Users List view */}
          <aside style={{
            width: '250px',
            borderRight: '1px solid gray',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '10px',
            backgroundColor: '#111827',
          }}>
            <div>
              <h3
                style={{
                  fontSize: '18px',
                  marginBottom: '10px',
                  color: 'white',
                  textShadow: '2px 2px 4px black',
                }}
              >
                <strong>Online Users</strong>
              </h3>
              {allUsers.map((user) => (
                <div
                  key={user.id}
                  style={{
                    padding: '8px',
                    marginBottom: '6px',
                    justifyContent: 'space-between',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: selectedUser?.id === user.id ? 'gray' : 'transparent',
                  }}
                  onClick={() => handleUserSelection(user)}
                >
                  <div style={{ color: 'white' }}>
                    <FaUserAlt /> {user.username}
                  </div>
                  {userIsTyaping?.userId === user.id && userIsTyaping?.isTyping && (
                    <div style={{color: "white" ,fontSize: "10px", background: "green", border:"1px solid white", padding: "4px" , borderRadius: "4px"}}>Typing...</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{
              justifyContent: 'space-between',
              fontSize: '16px',
              opacity: 0.7,
              color: 'lightgray',
              border: '1px solid gray',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
            }}>
             <div style={{ display: 'flex', alignItems: 'center' }}>
              <FaUserAlt style={{ margin: '4px' }}/>
             <strong style={{ color: 'white'}}>{username}</strong>
             </div>
             <button
               style={{
                 backgroundColor: 'red',
                 border: 'none',
                 color: 'white',
                 cursor: 'pointer',
                 padding: '8px',
                 fontSize: '16px',
                 borderRadius: '6px',
               }}
               onClick={handleLeaveChat}
             >
               Leave Chat
             </button>
            </div>
          </aside>

          {/* Text Message View */}
          <section style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '10px',
            position: 'relative',
          }}>
            <header style={{
              fontSize: '18px',
              marginBottom: '10px',
              fontWeight: 'bold',
              borderBottom: '1px solid gray',
              paddingBottom: '8px',
            }}>
              {selectedUser ? `Chat with ${selectedUser.username}` : 'Select a user to chat'}
            </header>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              paddingRight: '10px',
            }}>
              {selectedUser ? chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.senderName === username ? 'flex-end' : 'flex-start',
                    backgroundColor: msg.senderName === username ? 'purple' : 'black',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    color: 'white',
                  }}
                >
                  {msg.message}
                </div>
              )) : (
                <div style={{ textAlign: 'center', fontSize: '14px', opacity: 0.7 }}>
                  Select a user to start chatting
                </div>
              )}
            </div>

            {selectedUser && (
              <footer style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}>
                <input
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid gray',
                    backgroundColor: '#111827',
                    color: 'white',
                  }}
                  placeholder="Type a message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!message || !message?.trim()}
                  style={{
                    backgroundColor: !message || !message?.trim() ? 'gray' : 'green',
                    padding: '10px',
                    borderRadius: '5px',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  Send
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
