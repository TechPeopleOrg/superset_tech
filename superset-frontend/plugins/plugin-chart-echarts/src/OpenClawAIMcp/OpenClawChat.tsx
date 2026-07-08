/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Button, Card, Input, Space, Spin, Typography, theme } from 'antd';
import {
  ClearOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { OpenClawChatComponentProps } from './transformProps';
import { runChatLoop } from './orchestrator/runChatLoop';
import { McpClient } from './mcp/McpClient';
import { mcpToolsToOpenAI } from './mcp/toolAdapter';
import { createOpenClawApi } from './openclaw/OpenClawApi';

const { TextArea } = Input;
const { Paragraph, Text, Title } = Typography;

type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

const formatTime = (date: Date) =>
  date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export default function OpenClawChat(props: OpenClawChatComponentProps) {
  const {
    width,
    height,
    baseUrl,
    model,
    systemPrompt,
    temperature,
    speedText,
    mcpEnabled,
    mcpUrl,
    mcpToken,
    // @ts-ignore
    formData,
  } = props;
  const { token } = theme.useToken();

  const { apiKey } = formData;

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText, isStreaming]);

  const streamAnswer = (fullText: string) => {
    setIsStreaming(true);
    setStreamingText('');

    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setStreamingText(fullText.slice(0, index));
        index += 1;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
        setMessages(prev => [
          ...prev,
          {
            id: `${Date.now()}-a`,
            role: 'assistant',
            content: fullText,
            timestamp: new Date(),
          },
        ]);
        setStreamingText('');
      }
    }, speedText || 30);
  };

  const sendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !apiKey || !baseUrl) return;

    const userMessage: Message = {
      id: `${Date.now()}-u`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const history = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: trimmed },
    ];

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      let answer: string;

      const callOpenClaw = createOpenClawApi({ baseUrl, apiKey });

      if (mcpEnabled) {
        const mcpClient = new McpClient({
          url: mcpUrl,
          token: mcpToken || undefined,
        });
        await mcpClient.initialize();

        const deps = {
          callOpenClaw,
          listTools: async () => mcpToolsToOpenAI(await mcpClient.listTools()),
          callTool: (name: string, args: Record<string, unknown>) =>
            mcpClient.callTool(name, args),
          model,
          temperature,
        };

        const { answer: loopAnswer } = await runChatLoop({
          messages: history,
          deps,
        });
        answer = loopAnswer;
      } else {
        const message = await callOpenClaw({
          messages: history,
          model,
          temperature,
        });
        answer = message.content ?? '';
      }

      streamAnswer(answer);
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : 'Не удалось подключиться к данным Superset (MCP). Проверьте настройки.';
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: 'assistant',
          content: detail,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setStreamingText('');
    setIsStreaming(false);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendDisabled =
    !inputText.trim() || isStreaming || isLoading || !apiKey || !baseUrl;

  let inputPlaceholder: string;
  if (!apiKey) {
    inputPlaceholder = 'Укажите API key в настройках чарта';
  } else if (!baseUrl) {
    inputPlaceholder = 'Укажите base URL OpenClaw в настройках чарта';
  } else {
    inputPlaceholder = 'Что бы вы хотели узнать?';
  }

  return (
    <div
      style={{
        height,
        width,
        padding: 16,
        background: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadowTertiary,
      }}
    >
      <Card
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'none',
        }}
        bodyStyle={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${token.colorBorder}`,
            background: token.colorBgLayout,
            borderRadius: `${token.borderRadiusLG}px ${token.borderRadiusLG}px 0 0`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Space>
            <RobotOutlined
              style={{ fontSize: 20, color: token.colorPrimary }}
            />
            <Title level={4} style={{ margin: 0, color: token.colorText }}>
              OpenClaw Ассистент
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

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
            background: token.colorBgContainer,
            minHeight: 0,
          }}
        >
          {messages.length === 0 && !isStreaming && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                opacity: 0.6,
              }}
            >
              <RobotOutlined
                style={{
                  fontSize: 48,
                  marginBottom: 16,
                  color: token.colorPrimary,
                }}
              />
              <Text type="secondary">
                Задайте свой вопрос, и я помогу вам найти ответ
              </Text>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 16,
                animation: 'fadeIn 0.3s ease-in',
              }}
            >
              <div
                style={{
                  maxWidth: '70%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Space style={{ marginBottom: 4 }}>
                  {msg.role === 'assistant' && (
                    <RobotOutlined
                      style={{ fontSize: 14, color: token.colorPrimary }}
                    />
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {msg.role === 'assistant' ? 'OpenClaw Ассистент' : 'Вы'} •{' '}
                    {formatTime(msg.timestamp)}
                  </Text>
                  {msg.role === 'user' && (
                    <UserOutlined style={{ fontSize: 14 }} />
                  )}
                </Space>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    background:
                      msg.role === 'user'
                        ? token.colorPrimaryBg
                        : token.colorBgLayout,
                    border:
                      msg.role === 'user'
                        ? 'none'
                        : `1px solid ${token.colorBorder}`,
                    color:
                      msg.role === 'user'
                        ? token.colorPrimaryText
                        : token.colorText,
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Paragraph>
                </div>
              </div>
            </div>
          ))}

          {isStreaming && streamingText && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                marginBottom: 16,
              }}
            >
              <div style={{ maxWidth: '70%' }}>
                <Space style={{ marginBottom: 4 }}>
                  <RobotOutlined
                    style={{ fontSize: 14, color: token.colorPrimary }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    OpenClaw Ассистент печатает...
                  </Text>
                </Space>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: token.colorBgLayout,
                    border: `1px solid ${token.colorBorder}`,
                  }}
                >
                  <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {streamingText}
                    <span
                      style={{
                        display: 'inline-block',
                        width: 2,
                        height: '1.2em',
                        background: token.colorPrimary,
                        marginLeft: 2,
                        animation: 'blink 1s infinite',
                      }}
                    />
                  </Paragraph>
                </div>
              </div>
            </div>
          )}

          {isLoading && !isStreaming && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: 20,
              }}
            >
              <Spin
                tip={
                  mcpEnabled
                    ? 'Выполняю запрос к данным…'
                    : 'Думаю над ответом...'
                }
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderTop: `1px solid ${token.colorBorder}`,
            background: token.colorBgLayout,
          }}
        >
          <Space.Compact style={{ width: '100%' }}>
            <TextArea
              placeholder={inputPlaceholder}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={isLoading || isStreaming || !apiKey || !baseUrl}
              style={{ resize: 'none' }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={sendMessage}
              loading={isLoading}
              disabled={sendDisabled}
              style={{ height: 'auto' }}
            >
              Отправить
            </Button>
          </Space.Compact>
        </div>
      </Card>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 50%    { opacity: 1; }
          51%, 100%  { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
