  document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('kw-chat-widget');
    const chatMessages = document.getElementById('kw-chat-messages');
    const chatForm = document.getElementById('kw-chat-form');
    const chatInput = document.getElementById('kw-chat-input');
    const chatSendBtn = document.getElementById('kw-chat-send');
    const chatToggleBtn = document.getElementById('kw-chat-toggle');

    if (chatToggleBtn) {
      chatToggleBtn.addEventListener('click', () => {
        chatContainer.classList.toggle('minimized');
        chatToggleBtn.textContent = chatContainer.classList.contains('minimized') ? '+' : '−';
      });
    }

    // Dynamic Topic Inspector: Detects context keywords from the reasoning stream
    function detectThoughtTopic(text) {
      const lower = text.toLowerCase();
      
      if (lower.includes('event') || lower.includes('schedule') || lower.includes('time') || lower.includes('date')) {
        return 'Thinking about events & schedule...';
      }
      if (lower.includes('song') || lower.includes('request') || lower.includes('queue') || lower.includes('music')) {
        return 'Thinking about song requests...';
      }
      if (lower.includes('vrchat') || lower.includes('world') || lower.includes('instance') || lower.includes('join')) {
        return 'Thinking about VRChat world details...';
      }
      if (lower.includes('role') || lower.includes('staff') || lower.includes('team') || lower.includes('host')) {
        return 'Thinking about community roles & team...';
      }
      if (lower.includes('context') || lower.includes('database') || lower.includes('search') || lower.includes('query')) {
        return 'Analyzing database context...';
      }

      return 'Thinking...';
    }

    // Handle Streaming Chat Submission
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const prompt = chatInput.value.trim();
      if (!prompt) return;

      // 1. Render User Message
      appendMessage(prompt, 'user');
      chatInput.value = '';
      chatInput.disabled = true;
      chatSendBtn.disabled = true;

      // 2. Create AI Message Bubble Container
      const aiMsgDiv = document.createElement('div');
      aiMsgDiv.classList.add('kw-message', 'kw-message-ai');

      // Collapsible Live-Thinking Container
      const detailsEl = document.createElement('details');
      detailsEl.className = 'kw-thought-container';

      const summaryEl = document.createElement('summary');
      summaryEl.className = 'kw-thought-summary';
      
      const headerTextSpan = document.createElement('span');
      headerTextSpan.textContent = '🧠 Thinking...';
      summaryEl.appendChild(headerTextSpan);

      const thoughtContentEl = document.createElement('div');
      thoughtContentEl.className = 'kw-thought-content';

      detailsEl.appendChild(summaryEl);
      detailsEl.appendChild(thoughtContentEl);
      aiMsgDiv.appendChild(detailsEl);

      // Main Response Text Container
      const answerContainer = document.createElement('div');
      aiMsgDiv.appendChild(answerContainer);

      chatMessages.appendChild(aiMsgDiv);
      scrollToBottom();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
          throw new Error('Server returned an error response');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let rawAnswerText = '';
        let reasoningText = '';
        let isInsideThinkTag = false;
        let hasThinkingStarted = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') break;

              try {
                const parsed = JSON.parse(dataStr);
                const token = parsed.response || parsed.choices?.[0]?.delta?.content || '';

                // Detect <think> or <thought> opening tag
                if (token.includes('<think>') || token.includes('<thought>')) {
                  isInsideThinkTag = true;
                  hasThinkingStarted = true;
                  continue;
                }

                // Detect closing tag
                if (token.includes('</think>') || token.includes('</thought>')) {
                  isInsideThinkTag = false;
                  headerTextSpan.textContent = '🧠 Thought Process';
                  continue;
                }

                if (isInsideThinkTag) {
                  hasThinkingStarted = true;
                  reasoningText += token;
                  
                  // Stream reasoning into the dropdown box
                  thoughtContentEl.textContent = reasoningText;

                  // Dynamically update the header subject line as text flows in
                  const dynamicTopic = detectThoughtTopic(reasoningText);
                  headerTextSpan.textContent = `🧠 ${dynamicTopic}`;
                } else {
                  rawAnswerText += token;
                  
                  // Render stream answer in real time
                  if (window.marked) {
                    answerContainer.innerHTML = marked.parse(rawAnswerText);
                  } else {
                    answerContainer.textContent = rawAnswerText;
                  }
                }

                scrollToBottom();

              } catch (err) {
                // Ignore parsing errors for partial chunk fragments
              }
            }
          }
        }

        // Finalize header title when stream completes
        if (hasThinkingStarted) {
          headerTextSpan.textContent = '🧠 Thought Process';
        } else {
          // Remove container if no thinking tags were generated
          detailsEl.remove();
        }

      } catch (error) {
        console.error('Chat API Error:', error);
        answerContainer.textContent = 'Sorry, something went wrong. Please try again.';
      } finally {
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
        scrollToBottom();
      }
    });

    function appendMessage(text, sender) {
      const msgDiv = document.createElement('div');
      msgDiv.classList.add('kw-message', `kw-message-${sender}`);

      if (sender === 'user') {
        msgDiv.textContent = text;
      } else if (window.marked) {
        msgDiv.innerHTML = marked.parse(text);
      } else {
        msgDiv.textContent = text;
      }

      chatMessages.appendChild(msgDiv);
      scrollToBottom();
      return msgDiv;
    }

    function scrollToBottom() {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });