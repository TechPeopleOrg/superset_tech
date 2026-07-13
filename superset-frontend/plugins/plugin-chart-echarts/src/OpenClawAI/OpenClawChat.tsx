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
import { useEffect, useRef, useState, KeyboardEvent, ChangeEvent } from 'react';
import { SafeMarkdown } from '@superset-ui/core/components';
import {
  Button,
  Card,
  Input,
  message,
  Space,
  Spin,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  ClearOutlined,
  PaperClipOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { OpenClawChatComponentProps } from './transformProps';
import { parseAttachment } from './fileParsers';

const { TextArea } = Input;
const { Paragraph, Text, Title } = Typography;

type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

interface OpenClawErrorBody {
  error?: { message?: string };
}

interface OpenClawSuccessBody {
  choices?: Array<{ message?: { content?: string } }>;
}

const formatTime = (date: Date) =>
  date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const generateId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export default function OpenClawChat(props: OpenClawChatComponentProps) {
  const {
    width,
    height,
    baseUrl,
    model,
    systemPrompt,
    temperature,
    speedText,
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
  const [conversationId, setConversationId] = useState<string>(() =>
    generateId(),
  );
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    content: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText, isStreaming]);

  const streamIntervalRef = useRef<ReturnType<typeof setInterval>>();

  const streamAnswer = (fullText: string) => {
    // Split by Unicode code points so surrogate pairs (emoji) are not sliced apart.
    const chars = Array.from(fullText);
    setIsStreaming(true);
    setStreamingText('');

    let index = 0;
    streamIntervalRef.current = setInterval(() => {
      index += 1;
      if (index < chars.length) {
        setStreamingText(chars.slice(0, index).join(''));
      } else {
        clearInterval(streamIntervalRef.current);
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

  // Stop the typing interval if the component unmounts mid-stream.
  useEffect(
    () => () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    },
    [],
  );

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    try {
      const parsed = await parseAttachment(file);
      setAttachedFile(parsed);
    } catch (err) {
      message.warning(
        err instanceof Error ? err.message : 'Не удалось прочитать файл',
      );
    }
  };

  const handleDetachFile = () => {
    setAttachedFile(null);
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
      ...(attachedFile
        ? [
            {
              role: 'system' as const,
              content:
                `Пользователь прикрепил файл "${attachedFile.name}". ` +
                `Используй его содержимое как контекст:\n\n${attachedFile.content}`,
            },
          ]
        : []),
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: trimmed },
    ];

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          user: `conv:${conversationId}`,
          messages: history,
          temperature,
          stream: false,
        }),
      });

      if (!response.ok) {
        let detail = 'Ошибка запроса к OpenClaw';
        try {
          const errBody = (await response.json()) as OpenClawErrorBody;
          if (errBody?.error?.message) detail = errBody.error.message;
        } catch {
          // body not JSON — keep the generic message
        }
        setMessages(prev => [
          ...prev,
          {
            id: `${Date.now()}-e`,
            role: 'assistant',
            content: detail,
            timestamp: new Date(),
          },
        ]);
        return;
      }

      const body = (await response.json()) as OpenClawSuccessBody;
      const answer = body.choices?.[0]?.message?.content ?? '';
      streamAnswer(answer);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: 'assistant',
          content:
            'Извините, произошла ошибка. Пожалуйста, попробуйте еще раз.',
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
    setConversationId(generateId());
    setAttachedFile(null);
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
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <div className="openclaw-markdown">
                      <SafeMarkdown source={msg.content} />
                    </div>
                  ) : (
                    <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </Paragraph>
                  )}
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
                  <div className="openclaw-markdown openclaw-markdown--streaming">
                    <SafeMarkdown source={streamingText} />
                  </div>
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
              <Spin tip="Думаю над ответом..." />
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
          {attachedFile && (
            <div style={{ marginBottom: 8 }}>
              <Tag
                icon={<PaperClipOutlined />}
                closable
                onClose={handleDetachFile}
                color="processing"
                style={{ maxWidth: '100%' }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    maxWidth: 240,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'bottom',
                  }}
                  title={attachedFile.name}
                >
                  {attachedFile.name}
                </span>
              </Tag>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.xlsx,.xls,.pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <Space.Compact style={{ width: '100%' }}>
            <Button
              icon={<PaperClipOutlined />}
              onClick={handleAttachClick}
              disabled={isLoading || isStreaming || !apiKey || !baseUrl}
              style={{ height: 'auto' }}
              title="Прикрепить файл (.txt, .md, .xlsx, .xls, .pdf)"
            />
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
        .openclaw-markdown > *:first-child { margin-top: 0; }
        .openclaw-markdown > *:last-child { margin-bottom: 0; }
        .openclaw-markdown p { margin: 0 0 8px; }
        .openclaw-markdown ul,
        .openclaw-markdown ol { margin: 0 0 8px; padding-left: 20px; }
        .openclaw-markdown pre {
          margin: 0 0 8px;
          padding: 8px 12px;
          border-radius: 6px;
          overflow-x: auto;
          background: ${token.colorBgElevated};
        }
        .openclaw-markdown code {
          font-family: monospace;
          font-size: 0.9em;
        }
        .openclaw-markdown table {
          border-collapse: collapse;
          margin: 0 0 8px;
        }
        .openclaw-markdown th,
        .openclaw-markdown td {
          border: 1px solid ${token.colorBorder};
          padding: 4px 8px;
        }
        .openclaw-markdown a { color: ${token.colorLink}; }
        .openclaw-markdown--streaming > *:last-child::after {
          content: '';
          display: inline-block;
          width: 2px;
          height: 1.1em;
          vertical-align: text-bottom;
          margin-left: 2px;
          background: ${token.colorPrimary};
          animation: blink 1s infinite;
        }
      `}</style>
    </div>
  );
}
