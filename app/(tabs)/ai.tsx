import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { askClaude } from '../../lib/claude';
import type { ClaudeMessage } from '../../lib/claude';
import type { DbAiMessage, DbAiVote } from '../../lib/database.types';

// ── Types ─────────────────────────────────────────────────────────────────────

type PlaceCard = {
  name: string;
  address: string;
  rating: number;
  hours: string;
  pet_friendly: boolean;
};

type MessageSource = { label: string };

type Attachment = {
  name: string;
  size: string;
  mimeType: string;
};

type VoteOption = { text: string; votes: number };

type Message =
  | { id: string; dbId?: string; type: 'proactive'; text: string }
  | { id: string; dbId?: string; type: 'ai'; text: string; sources?: MessageSource[]; place?: PlaceCard }
  | { id: string; dbId?: string; type: 'ai_vote'; intro: string; options: VoteOption[]; myVote: number | null }
  | { id: string; dbId?: string; type: 'user'; text: string; sentBy?: string; attachments?: Attachment[] }
  | { id: string; type: 'typing' };

// ── Option parser ─────────────────────────────────────────────────────────────

function parseOptions(text: string): { intro: string; options: string[] } | null {
  const lines = text.split('\n');
  const optionLines: string[] = [];
  const introLines: string[] = [];
  let inOptions = false;

  for (const line of lines) {
    const match = line.trim().match(/^\d+\.\s+(.+)/);
    if (match) {
      inOptions = true;
      optionLines.push(match[1].trim());
    } else if (!inOptions && line.trim()) {
      introLines.push(line.trim());
    }
  }

  if (optionLines.length >= 2) {
    return { intro: introLines.join(' ').trim(), options: optionLines };
  }
  return null;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function dbVotesToVoteState(
  optionTexts: { text: string }[],
  votes: DbAiVote[],
  userId: string | null,
): { options: VoteOption[]; myVote: number | null } {
  const counts = new Array(optionTexts.length).fill(0);
  let myVote: number | null = null;
  for (const v of votes) {
    if (v.option_idx < counts.length) counts[v.option_idx]++;
    if (v.user_id === userId) myVote = v.option_idx;
  }
  return {
    options: optionTexts.map((o, i) => ({ text: o.text, votes: counts[i] })),
    myVote,
  };
}

function dbMsgToUiMsg(msg: DbAiMessage, votes: DbAiVote[], userId: string | null): Message {
  const msgVotes = votes.filter((v) => v.message_id === msg.id);
  switch (msg.type) {
    case 'ai_vote': {
      const optionTexts = (msg.options ?? []) as { text: string }[];
      const { options, myVote } = dbVotesToVoteState(optionTexts, msgVotes, userId);
      return { id: msg.id, dbId: msg.id, type: 'ai_vote', intro: msg.intro ?? '', options, myVote };
    }
    case 'user':
      return { id: msg.id, dbId: msg.id, type: 'user', text: msg.text ?? '', sentBy: msg.sent_by ?? undefined };
    case 'proactive':
      return { id: msg.id, dbId: msg.id, type: 'proactive', text: msg.text ?? '' };
    default:
      return { id: msg.id, dbId: msg.id, type: 'ai', text: msg.text ?? '' };
  }
}

// ── Attachment helpers ────────────────────────────────────────────────────────

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'document-text';
  if (mimeType.includes('image')) return 'image';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'grid';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  return 'attach';
}

function fileColor(mimeType: string): string {
  if (mimeType.includes('pdf')) return '#EF4444';
  if (mimeType.includes('image')) return '#3B82F6';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '#22C55E';
  return '#6B7280';
}

function getAttachmentAiResponse(attachments: Attachment[]): Omit<Extract<Message, { type: 'ai' }>, 'id' | 'type'> {
  const names = attachments.map((a) => a.name.toLowerCase()).join(' ');

  if (names.includes('hotel') || names.includes('booking') || names.includes('confirmation') || names.includes('reservation')) {
    return {
      text: "I've read your hotel confirmation. I can see a check-in on Apr 5 at Hotel Baur au Lac, Zürich — check-in from 3 PM, checkout Apr 7 by 11 AM. I've added this to your trip timeline and flagged the checkout time so you have buffer before your departure. Want me to plan the morning of Apr 7 around the 11 AM checkout?",
    };
  }
  if (names.includes('flight') || names.includes('ticket') || names.includes('boarding') || names.includes('eticket') || names.includes('e-ticket')) {
    return {
      text: "Got your e-ticket. I can see a flight from CDG (Paris) to ZRH (Zürich) on Apr 2 departing 10:35 — arriving 12:10 local time. I've updated your Day 1 plan to start from Zürich Airport. Therme Zurzach is only 55 min from the airport, so that's still a great first stop. Want me to add airport transit time as a stop?",
    };
  }
  if (names.includes('rail') || names.includes('train') || names.includes('eurail') || names.includes('sbb') || names.includes('sncf')) {
    return {
      text: "Train pass confirmed — looks like a Swiss Travel Pass valid Apr 2–7, covering unlimited travel on SBB trains, buses, and boats. Good news: Rhine Falls, Lucerne, and Interlaken are all on the network at no extra cost. I'll make sure all transport legs on your itinerary use covered routes.",
    };
  }
  if (names.includes('itinerary') || names.includes('plan') || names.includes('schedule')) {
    return {
      text: `I've scanned your itinerary document. I can see ${attachments.length > 1 ? 'multiple files with' : 'a file with'} existing stops planned. I'll cross-reference these with your current Roamies plan — a few times look tight, particularly day 2. Want me to suggest a reordered sequence that reduces backtracking?`,
    };
  }

  // Generic
  return {
    text: `I've received ${attachments.length === 1 ? 'your document' : `${attachments.length} files`} (${attachments.map((a) => a.name).join(', ')}). I'll use ${attachments.length === 1 ? 'it' : 'these'} as context while planning your trip. If there are booking references, dates, or addresses in there, I'll factor them into your itinerary. Anything specific you'd like me to extract?`,
  };
}

// ── Simulated AI responses ────────────────────────────────────────────────────

const QUICK_REPLIES = [
  'Any pet-friendly cafes near Lucerne?',
  'What time should we leave for Rhine Falls?',
  'Best restaurant in Interlaken?',
  'How long is the drive to Grindelwald?',
];

function getAiResponse(userText: string): Omit<Extract<Message, { type: 'ai' }>, 'id' | 'type'> {
  const lower = userText.toLowerCase();

  if (lower.includes('cafe') || lower.includes('coffee')) {
    return {
      text: "There's a great dog-friendly café near the Chapel Bridge — Café Rebstock (4.6★) has outdoor seating and a water bowl for pups. It's about a 3-minute walk from Luzern Hbf.",
      sources: [{ label: 'Google' }, { label: 'Timeout' }],
      place: {
        name: 'Café Rebstock',
        address: 'Rebstockweg 12, 6003 Luzern',
        rating: 4.6,
        hours: 'Open until 7 PM',
        pet_friendly: true,
      },
    };
  }

  if (lower.includes('rhine') || lower.includes('waterfall') || lower.includes('leave') || lower.includes('time')) {
    return {
      text: "For Rhine Falls, I'd aim to leave by 10:00 to arrive before the crowds hit. The drive from your current stop is about 45 minutes. Weekday mornings are significantly quieter — boat tickets sell out by noon on weekends.",
      sources: [{ label: 'Google' }, { label: 'Local news' }],
    };
  }

  if (lower.includes('restaurant') || lower.includes('food') || lower.includes('eat') || lower.includes('dinner') || lower.includes('lunch') || lower.includes('interlaken')) {
    return {
      text: "Top pick in Interlaken is Restaurant Schuh (4.5★) — classic Swiss dishes, dog-friendly terrace, and a great view of the Jungfrau. For a more local feel, try Gasthof Hirschen a short walk from the main street. Book ahead — both fill up by 7 PM.",
      sources: [{ label: 'Tabelog' }, { label: 'Google' }],
      place: {
        name: 'Restaurant Schuh',
        address: 'Höheweg 56, 3800 Interlaken',
        rating: 4.5,
        hours: 'Open until 10 PM',
        pet_friendly: true,
      },
    };
  }

  if (lower.includes('drive') || lower.includes('long') || lower.includes('grindelwald') || lower.includes('how far')) {
    return {
      text: "Interlaken to Grindelwald is about 25 minutes by car (18 km). If you're taking the scenic route via Wilderswil, add 10 minutes — worth it for the mountain views. Parking at Grindelwald is CHF 12/day at the main lot near the cable car.",
      sources: [{ label: 'Google Maps' }],
    };
  }

  if (lower.includes('pet') || lower.includes('dog') || lower.includes('friendly')) {
    return {
      text: "Good news — your whole route is very dog-friendly. Rhine Falls has a circular path that's leash-free in most sections. Therme Zurzach allows dogs in the outdoor pools area. Lucerne's Chapel Bridge walk is fully dog-accessible. Just avoid the Jungfraujoch if you're heading that far — dogs aren't permitted on the cogwheel train.",
      sources: [{ label: 'Google' }, { label: 'Local news' }],
    };
  }

  if (lower.includes('weather') || lower.includes('rain') || lower.includes('cold') || lower.includes('temperature')) {
    return {
      text: "This week looks good — mostly sunny in the lowlands (Lucerne, Zurich area) with highs around 14°C. Grindelwald and higher Alpine areas will be cooler, around 6°C, with potential afternoon showers. Bring a light waterproof layer. Rhine Falls is fine in light rain — the mist from the falls already soaks you anyway.",
      sources: [{ label: 'SRF Meteo' }],
    };
  }

  // Default
  return {
    text: "I've looked at your current itinerary and everything looks well-paced. Rhine Falls in the morning is smart timing — Therme Zurzach after is a perfect contrast. Lucerne in the evening gives you the golden-hour light on the Chapel Bridge. Want me to check anything specific along the route?",
    sources: [{ label: 'Google' }],
  };
}

// ── Seed messages ──────────────────────────────────────────────────────────────

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'm1',
    type: 'proactive',
    text: 'I removed Rosenlaui Valley from your plan — it\'s closed until May 14th. I\'ve added buffer time to your Grindelwald stop instead.',
  },
  {
    id: 'm2',
    type: 'user',
    text: 'Is there anywhere we can stop for a soak with the dog?',
  },
  {
    id: 'm3',
    type: 'ai',
    text: 'I found a great hot spring for tomorrow en route to Lucerne. Therme Zurzach (4.5★) is pet-friendly and confirmed open.',
    sources: [{ label: 'Google' }],
    place: {
      name: 'Therme Zurzach',
      address: 'Quellenstrasse 30, 5330 Bad Zurzach',
      rating: 4.5,
      hours: 'Open until 10 PM',
      pet_friendly: true,
    },
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function AiScreen() {
  const router = useRouter();
  const { activeTrip, todayStops, members, profile, userId } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Track IDs we inserted ourselves so real-time doesn't double-add them
  const ownInsertIds = useRef<Set<string>>(new Set());

  const scrollToEnd = (animated = true) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 80);
  };

  // ── Load messages + votes from DB ──────────────────────────────────────────
  useEffect(() => {
    if (!activeTrip?.id) return;
    (async () => {
      const { data: msgs } = await supabase
        .from('trip_ai_messages')
        .select('*')
        .eq('trip_id', activeTrip.id)
        .order('created_at', { ascending: true });

      if (!msgs?.length) return;

      const voteIds = msgs.filter((m: any) => m.type === 'ai_vote').map((m: any) => m.id);
      let votes: DbAiVote[] = [];
      if (voteIds.length > 0) {
        const { data } = await supabase.from('trip_ai_votes').select('*').in('message_id', voteIds);
        votes = (data ?? []) as DbAiVote[];
      }

      setMessages(msgs.map((m: any) => dbMsgToUiMsg(m as DbAiMessage, votes, userId)));
    })();
  }, [activeTrip?.id, userId]);

  // ── Real-time subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTrip?.id) return;

    const reloadVotes = async (messageId: string) => {
      const { data } = await supabase.from('trip_ai_votes').select('*').eq('message_id', messageId);
      const votes = (data ?? []) as DbAiVote[];
      setMessages((prev) =>
        prev.map((m) => {
          if (m.dbId !== messageId || m.type !== 'ai_vote') return m;
          const { options, myVote } = dbVotesToVoteState(
            m.options.map((o) => ({ text: o.text })),
            votes,
            userId,
          );
          return { ...m, options, myVote };
        })
      );
    };

    const channel = supabase
      .channel(`ai-chat-${activeTrip.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trip_ai_messages', filter: `trip_id=eq.${activeTrip.id}` },
        (payload) => {
          const newMsg = payload.new as DbAiMessage;
          if (ownInsertIds.current.has(newMsg.id)) {
            ownInsertIds.current.delete(newMsg.id);
            return;
          }
          setMessages((prev) => [...prev, dbMsgToUiMsg(newMsg, [], userId)]);
          scrollToEnd();
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_ai_votes' }, (payload) => {
        reloadVotes((payload.new as DbAiVote).message_id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trip_ai_votes' }, (payload) => {
        reloadVotes((payload.new as DbAiVote).message_id);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trip_ai_votes' }, (payload) => {
        const old = payload.old as Partial<DbAiVote>;
        if (old.message_id) reloadVotes(old.message_id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeTrip?.id, userId]);

  const buildSystemPrompt = () => {
    const stopList = todayStops.length > 0
      ? todayStops.map((s) => `- ${s.time}: ${s.place_name} (${s.category})`).join('\n')
      : 'No stops planned yet.';
    const memberNames = members.map((m) => m.name).join(', ') || 'Just you';
    return `You are Roamie, a friendly travel co-planner for a group trip.
Trip: ${activeTrip?.name ?? 'Unknown trip'}
Dates: ${activeTrip?.dates_label ?? 'Unknown dates'}
Travellers: ${memberNames}
Today's itinerary:
${stopList}

IMPORTANT FORMATTING RULES:
- When the question involves a decision, recommendation, or choice (e.g. "where should we go", "what should we do", "best option"), always present exactly 2–3 options as a numbered list.
- Format: one intro sentence, then each option on its own line starting with "1.", "2.", "3."
- Keep each option to one concise sentence with a practical detail.
- For simple factual questions (distances, hours, weather), answer directly without a list.
- Never use bullet points (–, •), only numbered lists for options.`;
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || !activeTrip?.id || !userId) return;

    setInputText('');
    setIsTyping(true);
    scrollToEnd();

    // Insert user message — real-time will broadcast it to all group members
    const { data: dbUserMsg } = await supabase
      .from('trip_ai_messages')
      .insert({ trip_id: activeTrip.id, type: 'user', text: content, sent_by: userId })
      .select().single();
    if (dbUserMsg) ownInsertIds.current.add(dbUserMsg.id);

    // Show user's own message immediately (don't wait for real-time)
    const userUiMsg: Message = {
      id: dbUserMsg?.id ?? `tmp_${Date.now()}`,
      dbId: dbUserMsg?.id,
      type: 'user',
      text: content,
      sentBy: userId,
    };
    setMessages((prev) => [...prev, userUiMsg]);

    // Build conversation history for Claude
    const history: ClaudeMessage[] = messages
      .filter((m) => m.type === 'ai' || m.type === 'ai_vote' || m.type === 'user')
      .map((m) => ({
        role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.type === 'ai_vote'
          ? `${(m as any).intro}\n${(m as any).options.map((o: any, i: number) => `${i + 1}. ${o.text}`).join('\n')}`
          : (m as any).text ?? '',
      }));
    history.push({ role: 'user', content });

    try {
      const replyText = await askClaude(buildSystemPrompt(), history);
      const parsed = parseOptions(replyText);

      let dbAiMsg: any;
      if (parsed) {
        const { data } = await supabase
          .from('trip_ai_messages')
          .insert({ trip_id: activeTrip.id, type: 'ai_vote', intro: parsed.intro, options: parsed.options.map((t) => ({ text: t })) })
          .select().single();
        dbAiMsg = data;
      } else {
        const { data } = await supabase
          .from('trip_ai_messages')
          .insert({ trip_id: activeTrip.id, type: 'ai', text: replyText })
          .select().single();
        dbAiMsg = data;
      }

      if (dbAiMsg) ownInsertIds.current.add(dbAiMsg.id);

      setIsTyping(false);
      if (parsed) {
        setMessages((prev) => [...prev, {
          id: dbAiMsg?.id ?? `ai_${Date.now()}`,
          dbId: dbAiMsg?.id,
          type: 'ai_vote',
          intro: parsed.intro,
          options: parsed.options.map((t) => ({ text: t, votes: 0 })),
          myVote: null,
        }]);
      } else {
        setMessages((prev) => [...prev, {
          id: dbAiMsg?.id ?? `ai_${Date.now()}`,
          dbId: dbAiMsg?.id,
          type: 'ai',
          text: replyText,
        }]);
      }
    } catch {
      const response = getAiResponse(content);
      setIsTyping(false);
      setMessages((prev) => [...prev, { id: `ai_${Date.now()}`, type: 'ai', ...response }]);
    }
    scrollToEnd();
  };

  const castVote = useCallback(async (msg: Extract<Message, { type: 'ai_vote' }>, optionIdx: number) => {
    const prevVote = msg.myVote;
    const dbId = msg.dbId;

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id || m.type !== 'ai_vote') return m;
        const options = m.options.map((o, i) => {
          if (i === prevVote && prevVote !== optionIdx) return { ...o, votes: Math.max(0, o.votes - 1) };
          if (i === optionIdx && prevVote !== optionIdx) return { ...o, votes: o.votes + 1 };
          if (i === optionIdx && prevVote === optionIdx) return { ...o, votes: Math.max(0, o.votes - 1) };
          return o;
        });
        return { ...m, options, myVote: prevVote === optionIdx ? null : optionIdx };
      })
    );

    if (!dbId || !userId) return;

    if (prevVote === optionIdx) {
      await supabase.from('trip_ai_votes').delete().eq('message_id', dbId).eq('user_id', userId);
    } else {
      await supabase.from('trip_ai_votes').upsert(
        { message_id: dbId, user_id: userId, option_idx: optionIdx },
        { onConflict: 'message_id,user_id' }
      );
    }
  }, [userId]);

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (result.canceled || !result.assets?.length) return;

      const attachments: Attachment[] = result.assets.map((asset) => ({
        name: asset.name,
        size: formatFileSize(asset.size),
        mimeType: asset.mimeType ?? 'application/octet-stream',
      }));

      const userMsg: Message = {
        id: `m${Date.now()}`,
        type: 'user',
        text: attachments.length === 1 ? 'Here is a file for context.' : `Here are ${attachments.length} files for context.`,
        attachments,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);
      scrollToEnd();

      setTimeout(() => {
        const response = getAttachmentAiResponse(attachments);
        setIsTyping(false);
        setMessages((prev) => [...prev, { id: `m${Date.now() + 1}`, type: 'ai', ...response }]);
        scrollToEnd();
      }, 2000);
    } catch {
      // user cancelled or permission denied — no-op
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.aiAvatar}>
            <Ionicons name="flash" size={16} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Roamie</Text>
            <Text style={styles.headerSub}>Your AI travel companion</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/profile')} activeOpacity={0.8}>
          <Text style={styles.avatarBtnText}>
            {profile?.display_name
              ? profile.display_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
              : 'ME'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sources bar */}
      <View style={styles.sourcesBar}>
        <Ionicons name="shield-checkmark-outline" size={13} color="#6B7280" />
        <Text style={styles.sourcesText}>
          Sources: Google Maps · Tabelog · Timeout · local news. No paid results.
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((msg) => {
            if (msg.type === 'proactive') return <ProactiveMessage key={msg.id} text={msg.text} />;
            if (msg.type === 'ai') return <AiMessage key={msg.id} msg={msg} />;
            if (msg.type === 'ai_vote') return <VoteCard key={msg.id} msg={msg} onVote={(i) => castVote(msg, i)} />;
            if (msg.type === 'user') return <UserMessage key={msg.id} text={msg.text} sentBy={msg.sentBy} attachments={msg.attachments} members={members} userId={userId} />;
            return null;
          })}

          {isTyping && <TypingIndicator />}

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Quick replies */}
        {!isTyping && (
          <View style={styles.quickRepliesWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickReplies}
            >
              {QUICK_REPLIES.map((reply) => (
                <TouchableOpacity
                  key={reply}
                  style={styles.quickReplyChip}
                  onPress={() => sendMessage(reply)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickReplyText}>{reply}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={pickFiles}
            activeOpacity={0.8}
            disabled={isTyping}
          >
            <Ionicons name="attach" size={22} color={isTyping ? '#D1D5DB' : '#6B3FA0'} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask or drop a file…"
            placeholderTextColor="#9CA3AF"
            multiline
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isTyping) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            activeOpacity={0.8}
            disabled={!inputText.trim() || isTyping}
          >
            <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProactiveMessage({ text }: { text: string }) {
  return (
    <View style={styles.proactiveWrapper}>
      <View style={styles.proactiveLabel}>
        <Ionicons name="flash" size={13} color="#6B3FA0" />
        <Text style={styles.proactiveLabelText}>PROACTIVE UPDATE</Text>
      </View>
      <View style={styles.proactiveCard}>
        <View style={styles.proactiveBorder} />
        <Text style={styles.proactiveText}>{text}</Text>
      </View>
    </View>
  );
}

function VoteCard({
  msg,
  onVote,
}: {
  msg: Extract<Message, { type: 'ai_vote' }>;
  onVote: (idx: number) => void;  // caller passes the full msg object
}) {
  const totalVotes = msg.options.reduce((sum, o) => sum + o.votes, 0);

  return (
    <View style={styles.aiWrapper}>
      <View style={styles.aiHeaderRow}>
        <View style={styles.aiAvatarSmall}>
          <Ionicons name="flash" size={12} color="#FFFFFF" />
        </View>
        <Text style={styles.aiLabel}>ROAMIE</Text>
        <View style={styles.voteBadge}>
          <Ionicons name="thumbs-up-outline" size={10} color="#6B3FA0" />
          <Text style={styles.voteBadgeText}>VOTE</Text>
        </View>
      </View>

      <View style={styles.aiCard}>
        {!!msg.intro && <Text style={styles.aiText}>{msg.intro}</Text>}

        <View style={styles.voteOptions}>
          {msg.options.map((opt, i) => {
            const isSelected = msg.myVote === i;
            const pct = totalVotes > 0 ? opt.votes / totalVotes : 0;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.voteOption, isSelected && styles.voteOptionSelected]}
                onPress={() => onVote(i)}
                activeOpacity={0.8}
              >
                {/* Progress bar fill */}
                {totalVotes > 0 && (
                  <View style={[styles.voteBar, { width: `${Math.round(pct * 100)}%` as any }]} />
                )}

                <View style={styles.voteOptionInner}>
                  <View style={[styles.voteNum, isSelected && styles.voteNumSelected]}>
                    {isSelected
                      ? <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      : <Text style={styles.voteNumText}>{i + 1}</Text>
                    }
                  </View>
                  <Text style={[styles.voteOptionText, isSelected && styles.voteOptionTextSelected]} numberOfLines={3}>
                    {opt.text}
                  </Text>
                  {totalVotes > 0 && (
                    <Text style={styles.voteCount}>{opt.votes}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.voteHint}>
          {msg.myVote !== null
            ? `You voted · ${totalVotes} vote${totalVotes !== 1 ? 's' : ''} total`
            : 'Tap an option to vote'}
        </Text>
      </View>
    </View>
  );
}

function AiMessage({ msg }: { msg: Extract<Message, { type: 'ai' }> }) {
  return (
    <View style={styles.aiWrapper}>
      <View style={styles.aiHeaderRow}>
        <View style={styles.aiAvatarSmall}>
          <Ionicons name="flash" size={12} color="#FFFFFF" />
        </View>
        <Text style={styles.aiLabel}>ROAMIE</Text>
      </View>
      <View style={styles.aiCard}>
        <Text style={styles.aiText}>
          {msg.text}
          {msg.sources?.map((s) => (
            <Text key={s.label} style={styles.sourceTag}>{`  [${s.label}]`}</Text>
          ))}
        </Text>
        {msg.place && <PlaceCardView place={msg.place} />}
      </View>
    </View>
  );
}

function PlaceCardView({ place }: { place: PlaceCard }) {
  return (
    <View style={styles.placeCard}>
      <View style={styles.placeImageBox}>
        <View style={[styles.placeImage, styles.placeImagePlaceholder]} />
        {place.pet_friendly && (
          <View style={styles.petBadge}>
            <Text style={styles.petBadgeText}>PET FRIENDLY</Text>
          </View>
        )}
      </View>
      <View style={styles.placeBody}>
        <Text style={styles.placeName}>{place.name}</Text>
        <Text style={styles.placeAddress}>{place.address}</Text>
        <View style={styles.placeMetaRow}>
          <Ionicons name="star" size={13} color="#F59E0B" />
          <Text style={styles.placeMeta}>{place.rating}</Text>
          <Ionicons name="time-outline" size={13} color="#6B7280" style={{ marginLeft: 8 }} />
          <Text style={styles.placeMeta}>{place.hours}</Text>
        </View>
      </View>
    </View>
  );
}

function UserMessage({
  text,
  sentBy,
  attachments,
  members,
  userId,
}: {
  text: string;
  sentBy?: string;
  attachments?: Attachment[];
  members: import('../../context/AppContext').Member[];
  userId: string | null;
}) {
  const isMe = !sentBy || sentBy === userId;
  const sender = !isMe ? members.find((m) => m.id === sentBy) : null;

  if (!isMe) {
    // Other group member's message — left aligned
    return (
      <View style={styles.otherWrapper}>
        <View style={[styles.otherAvatar, { backgroundColor: sender?.color ?? '#9CA3AF' }]}>
          <Text style={styles.otherAvatarText}>{sender?.initials ?? '??'}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.otherName}>{sender?.name ?? 'Member'}</Text>
          <View style={styles.otherBubble}>
            <Text style={styles.otherText}>{text}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.userWrapper}>
      {attachments && attachments.length > 0 && (
        <View style={styles.attachmentsStack}>
          {attachments.map((file, i) => (
            <View key={i} style={styles.fileChip}>
              <View style={[styles.fileIconCircle, { backgroundColor: fileColor(file.mimeType) + '20' }]}>
                <Ionicons name={fileIcon(file.mimeType) as any} size={18} color={fileColor(file.mimeType)} />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                {!!file.size && <Text style={styles.fileSize}>{file.size}</Text>}
              </View>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
            </View>
          ))}
        </View>
      )}
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ]),
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });

  return (
    <View style={styles.aiWrapper}>
      <View style={styles.aiHeaderRow}>
        <View style={styles.aiAvatarSmall}>
          <Ionicons name="flash" size={12} color="#FFFFFF" />
        </View>
        <Text style={styles.aiLabel}>ROAMIE</Text>
      </View>
      <View style={[styles.aiCard, styles.typingCard]}>
        <Animated.View style={[styles.typingDot, dotStyle(dot1)]} />
        <Animated.View style={[styles.typingDot, dotStyle(dot2)]} />
        <Animated.View style={[styles.typingDot, dotStyle(dot3)]} />
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F8',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  headerSub: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Sources bar
  sourcesBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#EBEBF0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sourcesText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },

  // Messages
  messages: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 20,
  },

  // Quick replies
  quickRepliesWrapper: {
    paddingVertical: 10,
  },
  quickReplies: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  quickReplyChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#DDD6F3',
  },
  quickReplyText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B3FA0',
  },

  // Proactive
  proactiveWrapper: { gap: 8 },
  proactiveLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  proactiveLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B3FA0',
    letterSpacing: 0.8,
  },
  proactiveCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  proactiveBorder: {
    width: 4,
    backgroundColor: '#6B3FA0',
  },
  proactiveText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
    padding: 16,
  },

  // AI message
  aiWrapper: { gap: 8 },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  aiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  aiText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  sourceTag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B3FA0',
  },

  // Vote card
  voteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EDE9F8',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 4,
  },
  voteBadgeText: { fontSize: 10, fontWeight: '700', color: '#6B3FA0', letterSpacing: 0.5 },

  voteOptions: { gap: 8 },
  voteOption: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
  },
  voteOptionSelected: {
    borderColor: '#6B3FA0',
    backgroundColor: '#F5F0FC',
  },
  voteBar: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    backgroundColor: '#EDE9F8',
    borderRadius: 10,
  },
  voteOptionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  voteNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  voteNumSelected: { backgroundColor: '#6B3FA0' },
  voteNumText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  voteOptionText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 19, fontWeight: '500' },
  voteOptionTextSelected: { color: '#4B1F8A', fontWeight: '600' },
  voteCount: { fontSize: 13, fontWeight: '700', color: '#6B3FA0', minWidth: 16, textAlign: 'right' },
  voteHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 2 },

  // Typing indicator
  typingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6B3FA0',
  },

  // Place card
  placeCard: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  placeImageBox: {
    height: 140,
    position: 'relative',
  },
  placeImage: {
    width: '100%',
    height: '100%',
  },
  placeImagePlaceholder: {
    backgroundColor: '#B0CDE0',
  },
  petBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#78450A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  petBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  placeBody: {
    padding: 14,
    gap: 4,
  },
  placeName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  placeAddress: {
    fontSize: 13,
    color: '#6B7280',
  },
  placeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  placeMeta: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },

  // Other member's message (left-aligned)
  otherWrapper: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  otherAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 4,
  },
  otherAvatarText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  otherName: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginLeft: 2 },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '78%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  otherText: { fontSize: 15, color: '#111827', lineHeight: 22 },

  // User message
  userWrapper: { alignItems: 'flex-end', gap: 6 },
  attachmentsStack: {
    gap: 6,
    maxWidth: '86%',
    alignItems: 'flex-end',
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    maxWidth: 280,
  },
  fileIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  fileSize: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  userBubble: {
    backgroundColor: '#6B3FA0',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '78%',
  },
  userText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F4F4F8',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: '#111827',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },

});
