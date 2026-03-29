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
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
// expo-file-system is not available on web — lazy-load only on native
const FileSystem = Platform.OS !== 'web'
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ? require('expo-file-system/legacy')
  : null;
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

type VoteOption = {
  text: string;          // fallback plain text
  name?: string;
  description?: string;
  rating?: number;
  address?: string;
  category?: string;
  coords?: { lat: number; lng: number };
  travelTime?: string;
  votes: number;
};

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
    // Handle "1.", "1)", "**1.**", "**1.**", "- 1." etc.
    const stripped = line.trim().replace(/\*\*/g, '');
    const match = stripped.match(/^(\d+)[.)]\s+(.+)/) ?? stripped.match(/^[-•]\s*(\d+)[.)]\s+(.+)/);
    if (match) {
      inOptions = true;
      optionLines.push(match[2].trim());
    } else if (!inOptions && line.trim()) {
      introLines.push(line.trim().replace(/\*\*/g, ''));
    } else if (inOptions && line.trim() && !line.trim().match(/^\d/)) {
      // Continuation of last option (multi-line)
      if (optionLines.length > 0) {
        optionLines[optionLines.length - 1] += ' ' + line.trim().replace(/\*\*/g, '');
      }
    }
  }

  if (optionLines.length >= 2) {
    return { intro: introLines.join(' ').trim(), options: optionLines.slice(0, 3) };
  }
  return null;
}

// ── Rich card helpers ─────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  if (km < 0.15) return `${Math.round(km * 1000)}m away`;
  if (km < 1) return `~${Math.round(km * 1000 / 80)} min walk`;
  return `~${Math.round(km / 0.08 / 60 > 1 ? km / 50 * 60 : km * 1000 / 80)} min · ${km.toFixed(1)}km`;
}

function categoryStyle(category?: string): { icon: string; color: string } {
  const cat = (category ?? '').toLowerCase();
  if (cat.includes('café') || cat.includes('cafe') || cat.includes('coffee') || cat.includes('breakfast') || cat.includes('brunch')) return { icon: 'cafe-outline', color: '#C4956A' };
  if (cat.includes('restaurant') || cat.includes('dining') || cat.includes('food') || cat.includes('lunch') || cat.includes('dinner')) return { icon: 'restaurant-outline', color: '#D4895A' };
  if (cat.includes('bar') || cat.includes('pub') || cat.includes('cocktail')) return { icon: 'wine-outline', color: '#7B9EB5' };
  if (cat.includes('museum') || cat.includes('gallery') || cat.includes('art') || cat.includes('culture')) return { icon: 'library-outline', color: '#6B3FA0' };
  if (cat.includes('park') || cat.includes('nature') || cat.includes('outdoor') || cat.includes('hike')) return { icon: 'leaf-outline', color: '#3D7A52' };
  if (cat.includes('spa') || cat.includes('wellness') || cat.includes('bath') || cat.includes('thermal')) return { icon: 'water-outline', color: '#1A5F7A' };
  if (cat.includes('hotel') || cat.includes('accommodation') || cat.includes('hostel')) return { icon: 'bed-outline', color: '#2B7A6E' };
  if (cat.includes('shop') || cat.includes('market') || cat.includes('store')) return { icon: 'bag-outline', color: '#8B7355' };
  return { icon: 'location-outline', color: '#6B7280' };
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
      const optionTexts = (msg.options ?? []) as any[];
      const { options: voteOptions, myVote } = dbVotesToVoteState(
        optionTexts.map((o) => ({ text: typeof o === 'string' ? o : (o.text ?? o.name ?? '') })),
        msgVotes,
        userId,
      );
      // Merge rich data back in
      const richMerged = voteOptions.map((vo, i) => ({
        ...vo,
        ...(typeof optionTexts[i] === 'object' ? optionTexts[i] : {}),
      }));
      return { id: msg.id, dbId: msg.id, type: 'ai_vote', intro: msg.intro ?? '', options: richMerged, myVote };
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


// Extract readable text from a basic (uncompressed) PDF
function extractPdfText(base64: string): string {
  try {
    const raw = atob(base64);
    const chunks: string[] = [];
    // BT...ET text blocks
    const btBlocks = raw.match(/BT[\s\S]*?ET/g) ?? [];
    for (const block of btBlocks) {
      const tj = block.match(/\(([^)]{1,200})\)\s*Tj/g) ?? [];
      for (const t of tj) {
        const m = t.match(/\(([^)]+)\)/);
        if (m) chunks.push(m[1]);
      }
      const tjArr = block.match(/\[([^\]]{1,500})\]\s*TJ/g) ?? [];
      for (const t of tjArr) {
        const inner = t.match(/\(([^)]+)\)/g) ?? [];
        for (const s of inner) chunks.push(s.slice(1, -1));
      }
    }
    // Fallback: grab printable ASCII runs (catches some non-BT streams)
    if (chunks.length === 0) {
      const runs = raw.match(/[\x20-\x7E]{6,}/g) ?? [];
      return runs.filter((r) => /[a-zA-Z]{3,}/.test(r)).join(' ').slice(0, 4000);
    }
    return chunks.join(' ').replace(/\\n/g, '\n').slice(0, 4000);
  } catch {
    return '';
  }
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


// ── Simulated AI responses ────────────────────────────────────────────────────

const QUICK_REPLIES = [
  'Pet-friendly cafes near Lucerne',
  'When to leave for Rhine Falls?',
  'Best Interlaken restaurant',
  'Drive time to Grindelwald',
];


// ── Component ──────────────────────────────────────────────────────────────────

export default function AiScreen() {
  const router = useRouter();
  const { prefill, autoSend } = useLocalSearchParams<{ prefill?: string; autoSend?: string }>();
  const { activeTrip, todayStops, members, profile, userId, addStop } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; content: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const prefillApplied = useRef(false);

  // Apply prefill from route params (e.g. from mini panel in Trip tab)
  useEffect(() => {
    if (!prefill || prefillApplied.current) return;
    prefillApplied.current = true;
    if (autoSend === 'true') {
      // sendMessage depends on activeTrip/userId which may not be ready yet — short delay
      setTimeout(() => sendMessage(prefill as string), 300);
    } else {
      setInputText(prefill as string);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Try to get current location (best-effort, no hard requirement)
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((loc) => setCurrentCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }))
        .catch(() => {});
    });
  }, []);
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
          if (m.type === 'typing' || m.dbId !== messageId || m.type !== 'ai_vote') return m;
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
    const locationLine = currentCoords
      ? `Current GPS: ${currentCoords.latitude.toFixed(4)}, ${currentCoords.longitude.toFixed(4)} (use this to estimate travel times)`
      : 'Current location: not available';

    return `You are Roamie, a warm and knowledgeable travel companion for a group trip. You know the trip details below and chat naturally with the travellers.

Trip: ${activeTrip?.name ?? 'Unknown trip'}
Dates: ${activeTrip?.dates_label ?? 'Unknown dates'}
Travellers: ${memberNames}
${locationLine}
Today's itinerary:
${stopList}

RESPONSE RULES:

1. For greetings, casual chat, or simple factual questions ("hi", "what time is it", "how far is X", "is it open") — reply naturally in plain conversational text, 1–3 sentences. Be warm and friendly.

2. ONLY use vote card JSON when the user explicitly asks to "suggest", "recommend", "find options", "where should we", "what are some good", or wants to compare places. In that case respond with ONLY valid JSON (no markdown, no code fences):
{"type":"vote","intro":"One sentence intro.","options":[{"name":"Place Name","description":"2-sentence description.","rating":4.5,"address":"Street address","category":"café","coords":{"lat":0.0000,"lng":0.0000},"travelTime":"~10 min walk"},{"name":"...","description":"...","rating":4.3,"address":"...","category":"restaurant","coords":{"lat":0.0000,"lng":0.0000},"travelTime":"~15 min drive"},{"name":"...","description":"...","rating":4.7,"address":"...","category":"café","coords":{"lat":0.0000,"lng":0.0000},"travelTime":"~5 min walk"}]}
Vote cards must have EXACTLY 3 options with real place names and realistic coords.

3. Never force vote cards on conversational messages. Match the energy of what was asked.`;
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
    // If there's a pending file, attach its content to this message and clear it
    const fileCtx = pendingFile;
    setPendingFile(null);
    const userContentForAi = fileCtx
      ? `${content}\n\n[Attached file: "${fileCtx.name}"]\n${fileCtx.content.length > 50 ? fileCtx.content : '(Could not extract text from this file)'}`
      : content;
    history.push({ role: 'user', content: userContentForAi });

    // Use a document-aware system prompt when a file is attached
    const systemPrompt = fileCtx
      ? `${buildSystemPrompt()}

The user has attached a document. Follow their instruction exactly.
- If they ask to extract/add to plan: return ONLY a JSON array — no other text:
  [{"place_name":"Name","category":"hotel|restaurant|sightseeing|transport","date":"YYYY-MM-DD","time":"HH:MM","notes":"optional"}]
- If they ask a question about the document: answer in plain text.
- NEVER return vote JSON for document tasks.`
      : buildSystemPrompt();

    try {
      const replyText = await askClaude(systemPrompt, history);

      // If file was attached, try to parse as stop list first
      if (fileCtx) {
        let stops: { place_name: string; category: string; date?: string; time?: string; notes?: string }[] = [];
        try {
          const jsonMatch = replyText.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').match(/\[[\s\S]*\]/);
          if (jsonMatch) stops = JSON.parse(jsonMatch[0]);
        } catch {}

        if (stops.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          for (const stop of stops) {
            await addStop({
              place_name: stop.place_name,
              category: stop.category ?? 'sightseeing',
              time: stop.time ?? '12:00',
              description: stop.notes ?? '',
              hours_today: 'unknown',
              duration_minutes: 60,
              pet_friendly: false,
              origin: 'ai_suggested',
              sources: [],
            }, stop.date ?? today);
          }
          const aiText = `Done! I've added ${stops.length} stop${stops.length !== 1 ? 's' : ''} from "${fileCtx.name}" to your trip plan:\n\n${stops.map((s) => `• ${s.place_name}${s.date ? ` — ${s.date}` : ''}`).join('\n')}`;
          const { data: dbAiMsg } = await supabase
            .from('trip_ai_messages')
            .insert({ trip_id: activeTrip.id, type: 'ai', text: aiText })
            .select().single();
          if (dbAiMsg) ownInsertIds.current.add(dbAiMsg.id);
          setIsTyping(false);
          setMessages((prev) => [...prev, { id: dbAiMsg?.id ?? `ai_${Date.now()}`, dbId: dbAiMsg?.id, type: 'ai', text: aiText }]);
          scrollToEnd();
          return;
        }
      }

      // Try JSON vote format first, fall back to numbered list, then plain text
      let voteData: { intro: string; options: string[]; richOptions?: (any | null)[] } | null = null;
      try {
        // Strip markdown code fences Llama sometimes adds
        const cleaned = replyText.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const json = JSON.parse(jsonMatch[0]);
          if (json.type === 'vote' && Array.isArray(json.options) && json.options.length >= 2) {
            // Handle both rich object format and plain string format
            const options = json.options.slice(0, 3).map((o: any) =>
              typeof o === 'string' ? o : o.name ? `${o.name} — ${o.description ?? ''}` : String(o)
            );
            voteData = {
              intro: json.intro ?? '',
              options,
              richOptions: json.options.slice(0, 3).map((o: any) =>
                typeof o === 'object' && o.name ? o : null
              ),
            };
          }
        }
      } catch {}

      if (!voteData) voteData = parseOptions(replyText);

      let dbAiMsg: any;
      if (voteData) {
        const dbOptions = voteData.richOptions?.every(Boolean)
          ? voteData.richOptions.map((o) => ({ ...o, text: `${o.name} — ${o.description ?? ''}` }))
          : voteData.options.map((t) => ({ text: t }));

        const { data } = await supabase
          .from('trip_ai_messages')
          .insert({ trip_id: activeTrip.id, type: 'ai_vote', intro: voteData.intro, options: dbOptions })
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
      if (voteData) {
        setMessages((prev) => [...prev, {
          id: dbAiMsg?.id ?? `ai_${Date.now()}`,
          dbId: dbAiMsg?.id,
          type: 'ai_vote',
          intro: voteData!.intro,
          options: (voteData!.richOptions?.every(Boolean)
            ? voteData!.richOptions.map((o) => ({ ...o, text: `${o.name} — ${o.description ?? ''}`, votes: 0 }))
            : voteData!.options.map((t) => ({ text: t, votes: 0 }))
          ),
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
    } catch (err) {
      console.error('Roamie API error:', err);
      setIsTyping(false);
      setMessages((prev) => [...prev, {
        id: `ai_${Date.now()}`,
        type: 'ai',
        text: `Sorry, I couldn't get a response right now. (${err instanceof Error ? err.message : String(err)})`,
      }]);
    }
    scrollToEnd();
  };

  const addToPlan = useCallback((optionText: string) => {
    // Extract place name — everything before " — " or " - "
    const placeName = optionText.split(/\s[—\-]\s/)[0].trim();
    const today = new Date().toISOString().split('T')[0];
    Alert.alert(
      'Add to trip plan?',
      `"${placeName}" will be added to today's stops.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: () => {
            addStop({ place_name: placeName, category: 'sightseeing', time: '12:00', description: '', hours_today: 'unknown', duration_minutes: 60, pet_friendly: false, origin: 'ai_suggested', sources: [] }, today);
          },
        },
      ]
    );
  }, [addStop]);

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
    if (!activeTrip?.id || !userId) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: ['application/pdf', 'text/plain', 'text/*'],
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      // Read file content immediately
      let fileText = '';
      try {
        if (asset.mimeType?.includes('pdf')) {
          const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
          fileText = extractPdfText(b64);
        } else {
          fileText = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
        }
      } catch { fileText = ''; }

      // Store content for next user message, show file chip + prompt in chat
      setPendingFile({ name: asset.name, content: fileText });

      const promptText = fileText.length > 50
        ? `📎 "${asset.name}" ready. What would you like me to do with it?`
        : `📎 "${asset.name}" attached (couldn't extract text — it may be a scanned PDF). What would you like me to do?`;

      setMessages((prev) => [...prev, {
        id: `file_${Date.now()}`,
        type: 'ai',
        text: promptText,
      }]);
      scrollToEnd();
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
          {messages.filter((msg, i, arr) => arr.findIndex((m) => m.id === msg.id) === i).map((msg) => {
            if (msg.type === 'proactive') return <ProactiveMessage key={msg.id} text={msg.text} />;
            if (msg.type === 'ai') return <AiMessage key={msg.id} msg={msg} />;
            if (msg.type === 'ai_vote') return <VoteCard key={msg.id} msg={msg} onVote={(i) => castVote(msg, i)} onAddToPlan={addToPlan} currentCoords={currentCoords} />;
            if (msg.type === 'user') return <UserMessage key={msg.id} text={msg.text} sentBy={msg.sentBy} attachments={msg.attachments} members={members} userId={userId} />;
            return null;
          })}

          {isTyping && <TypingIndicator />}

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Quick replies — collapsible */}
        {!isTyping && (
          <View style={styles.quickRepliesWrapper}>
            <TouchableOpacity
              style={styles.quickRepliesToggle}
              onPress={() => setShowReplies((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.quickRepliesToggleText}>Suggestions</Text>
              <Ionicons name={showReplies ? 'chevron-down' : 'chevron-up'} size={14} color="#9CA3AF" />
            </TouchableOpacity>
            {showReplies && (
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
            )}
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
  onAddToPlan,
  currentCoords,
}: {
  msg: Extract<Message, { type: 'ai_vote' }>;
  onVote: (idx: number) => void;
  onAddToPlan: (optionText: string) => void;
  currentCoords: { latitude: number; longitude: number } | null;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 32 - 32; // screen - message padding - aiCard padding
  const [activeIdx, setActiveIdx] = useState(0);
  const carouselRef = useRef<ScrollView>(null);

  const totalVotes = msg.options.reduce((sum, o) => sum + o.votes, 0);
  const leadingIdx = totalVotes > 0
    ? msg.options.reduce((best, o, i, arr) => o.votes > arr[best].votes ? i : best, 0)
    : null;

  const votedOpt = msg.myVote !== null ? msg.options[msg.myVote] : null;
  const addTarget = votedOpt ?? (leadingIdx !== null ? msg.options[leadingIdx] : null);

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

      <View style={[styles.aiCard, { padding: 0, overflow: 'hidden' }]}>
        {!!msg.intro && (
          <Text style={[styles.aiText, { padding: 14, paddingBottom: 10 }]}>{msg.intro}</Text>
        )}

        {/* Carousel */}
        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
            setActiveIdx(idx);
          }}
          style={{ width: cardWidth }}
        >
          {msg.options.map((opt, i) => {
            const isSelected = msg.myVote === i;
            const isLeading = leadingIdx === i && totalVotes > 0;
            const catStyle = categoryStyle(opt.category);
            const pct = totalVotes > 0 ? Math.round(opt.votes / totalVotes * 100) : 0;

            let distanceText = opt.travelTime ?? null;
            if (!distanceText && currentCoords && opt.coords?.lat && opt.coords?.lng) {
              const km = haversineKm(currentCoords.latitude, currentCoords.longitude, opt.coords.lat, opt.coords.lng);
              distanceText = formatDistance(km);
            }

            return (
              <View key={i} style={[styles.carouselCard, { width: cardWidth }]}>
                {/* Colour header — photo goes here later */}
                <View style={[styles.carouselHeader, { backgroundColor: catStyle.color }]}>
                  <Ionicons name={catStyle.icon as any} size={32} color="rgba(255,255,255,0.9)" />
                  {isLeading && (
                    <View style={styles.carouselLeadBadge}>
                      <Text style={styles.carouselLeadText}>LEADING</Text>
                    </View>
                  )}
                  {isSelected && (
                    <View style={styles.carouselVotedBadge}>
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      <Text style={styles.carouselVotedText}>VOTED</Text>
                    </View>
                  )}
                </View>

                {/* Details */}
                <View style={styles.carouselBody}>
                  <Text style={styles.carouselName} numberOfLines={1}>
                    {opt.name ?? opt.text.split(' — ')[0]}
                  </Text>

                  <View style={styles.richMeta}>
                    {opt.rating && (
                      <>
                        <Ionicons name="star" size={12} color="#F59E0B" />
                        <Text style={styles.richMetaText}>{opt.rating}</Text>
                        <Text style={styles.richMetaDot}>·</Text>
                      </>
                    )}
                    {distanceText && (
                      <>
                        <Ionicons name="navigate-outline" size={12} color="#6B7280" />
                        <Text style={styles.richMetaText}>{distanceText}</Text>
                      </>
                    )}
                    {totalVotes > 0 && (
                      <>
                        <Text style={styles.richMetaDot}>·</Text>
                        <Text style={[styles.richMetaText, isSelected && { color: '#6B3FA0', fontWeight: '700' }]}>
                          {opt.votes} vote{opt.votes !== 1 ? 's' : ''}
                        </Text>
                      </>
                    )}
                  </View>

                  {opt.description && (
                    <Text style={styles.carouselDescription}>{opt.description}</Text>
                  )}

                  {opt.address && (
                    <Text style={styles.richAddress} numberOfLines={1}>{opt.address}</Text>
                  )}

                  {/* Vote progress bar */}
                  {totalVotes > 0 && (
                    <View style={styles.carouselProgressTrack}>
                      <View style={[styles.carouselProgressFill, {
                        width: `${pct}%` as any,
                        backgroundColor: isSelected ? '#6B3FA0' : '#C4B5FD',
                      }]} />
                    </View>
                  )}

                  {/* Vote button */}
                  <TouchableOpacity
                    style={[styles.carouselVoteBtn, isSelected && styles.carouselVoteBtnSelected]}
                    onPress={() => onVote(i)}
                    activeOpacity={0.8}
                  >
                    {isSelected
                      ? <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                      : <Ionicons name="thumbs-up-outline" size={16} color="#6B3FA0" />
                    }
                    <Text style={[styles.carouselVoteBtnText, isSelected && { color: '#FFFFFF' }]}>
                      {isSelected ? 'Voted' : 'Vote for this'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Dots + Add to plan */}
        <View style={styles.carouselFooter}>
          <View style={styles.carouselDots}>
            {msg.options.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  carouselRef.current?.scrollTo({ x: i * cardWidth, animated: true });
                  setActiveIdx(i);
                }}
              >
                <View style={[styles.carouselDot, activeIdx === i && styles.carouselDotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          {addTarget && (
            <TouchableOpacity
              style={styles.richAddBtn}
              onPress={() => onAddToPlan(addTarget.name ?? addTarget.text)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={13} color="#6B3FA0" />
              <Text style={styles.richAddText}>
                {msg.myVote !== null ? 'Add voted place to plan' : 'Add leading to plan'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
    paddingTop: 6,
    paddingBottom: 4,
  },
  quickRepliesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  quickRepliesToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.4,
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

  voteHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 2 },

  // Rich vote option cards
  richOption: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    position: 'relative',
    overflow: 'hidden',
    minHeight: 90,
  },
  richOptionSelected: {
    backgroundColor: '#FAF5FF',
  },
  richVoteBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    opacity: 0.15,
  },
  richCategoryStrip: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  richContent: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  richNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  richName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  richNameSelected: {
    color: '#6B3FA0',
  },
  richVotedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  richLeadBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  richLeadText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  richMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  richMetaText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  richMetaDot: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  richDescription: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  richAddress: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  richAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  richAddText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B3FA0',
  },

  // Carousel vote card
  carouselCard: {
    backgroundColor: '#FFFFFF',
  },
  carouselHeader: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  carouselLeadBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  carouselLeadText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  carouselVotedBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6B3FA0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  carouselVotedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  carouselBody: {
    padding: 14,
    gap: 6,
  },
  carouselName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  carouselDescription: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 19,
  },
  carouselProgressTrack: {
    height: 3,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  carouselProgressFill: {
    height: 3,
    borderRadius: 2,
  },
  carouselVoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#6B3FA0',
    backgroundColor: '#FFFFFF',
  },
  carouselVoteBtnSelected: {
    backgroundColor: '#6B3FA0',
    borderColor: '#6B3FA0',
  },
  carouselVoteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B3FA0',
  },
  carouselFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  carouselDots: {
    flexDirection: 'row',
    gap: 6,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
  },
  carouselDotActive: {
    width: 18,
    backgroundColor: '#6B3FA0',
  },

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
