/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed under the License for the specific language governing
 * permissions and limitations under the License.
 */

import { useEffect, useState, useRef } from 'react';
import { Button, Input, Space, Card, Typography, Spin, theme } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, ClearOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function EchartsPie(props: any) {
  const { height, width, token: Token, model, speedText, sourceId, threadId } = props;
  const { token } = theme.useToken();
  
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Автоматическая прокрутка к последнему сообщению
  const scrollToBottom = () => {
    if (isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  // Эффект печатающегося текста
  const streamAnswer = (fullText: string) => {
    setIsStreaming(true);
    setStreamingText('');
    
    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setStreamingText(fullText.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
        
        // Добавляем полный ответ в историю сообщений
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          type: 'assistant',
          content: fullText,
          timestamp: new Date()
        }]);
        setStreamingText('');
      }
    }, speedText || 30);
    
    return () => clearInterval(interval);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    
    // Добавляем сообщение пользователя
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    const sourceIdValue = sourceId ? { source_id: sourceId } : {};
    const threadIdValue = threadId ? { thread_id: threadId } : {};
    
    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: inputText,
        model: model || 'gpt-5',
        ...sourceIdValue,
        ...threadIdValue,
      })
    };
    
    try {
      const response = await fetch('https://api.camelai.com/api/v1/ask_camel', options);
      const res = await response.json();
      const { message } = res;
      const { answer, artifacts } = message;
      
      console.log('Artifacts:', artifacts);
      
      // Запускаем эффект печатания
      streamAnswer(answer);
      
    } catch (err) {
      console.error('Error:', err);
      // Показываем ошибку в чате
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'assistant',
        content: 'Извините, произошла ошибка. Пожалуйста, попробуйте еще раз.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setStreamingText('');
    setIsStreaming(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ 
      height, 
      width, 
      padding: '16px',
      background: token.colorBgContainer,
      borderRadius: token.borderRadiusLG,
      boxShadow: token.boxShadowTertiary
    }}>
      <Card
        style={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          boxShadow: 'none'
        }}
        bodyStyle={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          padding: 0
        }}
      >
        {/* Заголовок чата */}
        <div style={{ 
          padding: '16px 20px', 
          borderBottom: `1px solid ${token.colorBorder}`,
          background: token.colorBgLayout,
          borderRadius: `${token.borderRadiusLG}px ${token.borderRadiusLG}px 0 0`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Space>
            <RobotOutlined style={{ fontSize: '20px', color: token.colorPrimary }} />
            <Title level={4} style={{ margin: 0, color: token.colorText }}>
              AI Ассистент
            </Title>
          </Space>
          {messages.length > 0 && (
            <Button 
              type="text" 
              icon={<ClearOutlined />} 
              onClick={handleClearChat}
              size="small"
            >
              Очистить
            </Button>
          )}
        </div>

        {/* Область сообщений */}
        <div 
          ref={chatContainerRef}
          style={{ 
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            background: token.colorBgContainer,
            minHeight: 0
          }}
        >
          {messages.length === 0 && !isStreaming && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              opacity: 0.6
            }}>
              <RobotOutlined style={{ fontSize: '48px', marginBottom: '16px', color: token.colorPrimary }} />
              <Text type="secondary">Задайте свой вопрос, и я помогу вам найти ответ</Text>
            </div>
          )}
          
          {/* Сообщения */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '16px',
                animation: 'fadeIn 0.3s ease-in'
              }}
            >
              <div style={{
                maxWidth: '70%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.type === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <Space style={{ marginBottom: '4px' }}>
                  {msg.type === 'assistant' && <RobotOutlined style={{ fontSize: '14px', color: token.colorPrimary }} />}
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {msg.type === 'assistant' ? 'AI Ассистент' : 'Вы'} • {formatTime(msg.timestamp)}
                  </Text>
                  {msg.type === 'user' && <UserOutlined style={{ fontSize: '14px' }} />}
                </Space>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: msg.type === 'user' ? token.colorPrimaryBg : token.colorBgLayout,
                  border: msg.type === 'user' ? 'none' : `1px solid ${token.colorBorder}`,
                  color: msg.type === 'user' ? token.colorPrimaryText : token.colorText,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap'
                }}>
                  <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Paragraph>
                </div>
              </div>
            </div>
          ))}
          
          {/* Печатающийся ответ */}
          {isStreaming && streamingText && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '16px'
            }}>
              <div style={{ maxWidth: '70%' }}>
                <Space style={{ marginBottom: '4px' }}>
                  <RobotOutlined style={{ fontSize: '14px', color: token.colorPrimary }} />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    AI Ассистент печатает...
                  </Text>
                </Space>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: token.colorBgLayout,
                  border: `1px solid ${token.colorBorder}`,
                  position: 'relative'
                }}>
                  <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {streamingText}
                    <span style={{
                      display: 'inline-block',
                      width: '2px',
                      height: '1.2em',
                      background: token.colorPrimary,
                      marginLeft: '2px',
                      animation: 'blink 1s infinite'
                    }} />
                  </Paragraph>
                </div>
              </div>
            </div>
          )}
          
          {/* Индикатор загрузки */}
          {isLoading && !isStreaming && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Spin tip="Думаю над ответом..." />
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Область ввода */}
        <div style={{ 
          padding: '16px 20px', 
          borderTop: `1px solid ${token.colorBorder}`,
          background: token.colorBgLayout
        }}>
          <Space.Compact style={{ width: '100%' }}>
            <TextArea
              placeholder="Что бы вы хотели узнать?"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={isLoading || isStreaming}
              style={{ resize: 'none' }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
              loading={isLoading}
              disabled={!inputText.trim() || isStreaming}
              style={{ height: 'auto' }}
            >
              Отправить
            </Button>
          </Space.Compact>
        </div>
      </Card>

      {/* Стили анимаций */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes blink {
          0%, 50% {
            opacity: 1;
          }
          51%, 100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}