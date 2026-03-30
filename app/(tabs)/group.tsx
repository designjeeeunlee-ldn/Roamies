import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  useWindowDimensions,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import ScreenHeader from '../../components/ScreenHeader';
import { formatTripDates, tripCountdown } from '../../lib/dateFormat';
import { askClaude } from '../../lib/claude';
import type { ClaudeMessage } from '../../lib/claude';
import { supabase } from '../../lib/supabase';

// ── Members ───────────────────────────────────────────────────────────────────

const MEMBERS = [
  { id: 'jee',    name: 'Jee Eun', role: 'PLANNER',     initials: 'JE', color: '#6B3FA0', status: 'live', location: 'Interlaken West' },
  { id: 'ben',    name: 'Ben',     role: 'PLANNER',     initials: 'BE', color: '#22C55E', status: 'off',  lastSeen: '2h ago' },
  { id: 'eliska', name: 'Eliška', role: 'PLANNER',     initials: 'EL', color: '#F97316', status: 'live', location: 'Luzern Hbf' },
  { id: 'david',  name: 'David',   role: 'CONTRIBUTOR', initials: 'DA', color: '#F59E0B', status: 'off',  lastSeen: '30m ago' },
] as const;

type MemberId = typeof MEMBERS[number]['id'];

const MEMBER_MAP = Object.fromEntries(MEMBERS.map((m) => [m.id, m])) as Record<MemberId, typeof MEMBERS[number]>;

const VOTER_COLORS: Record<string, string> = {
  JE: '#6B3FA0', BE: '#22C55E', EL: '#F97316', DA: '#F59E0B',
};

// ── Activity ──────────────────────────────────────────────────────────────────

type ActivityItem = { id: string; initials: string; color: string; action: string; time: string; icon: string; iconColor: string };

const ACTIVITY: ActivityItem[] = [
  { id: 'a1', initials: 'JE', color: '#6B3FA0', action: 'marked Rhine Falls as done',  time: '2m ago',  icon: 'checkmark-circle', iconColor: '#22C55E' },
  { id: 'a2', initials: 'EL', color: '#F97316', action: 'is near Luzern Hbf',           time: '5m ago',  icon: 'location',         iconColor: '#6B3FA0' },
  { id: 'a3', initials: 'DA', color: '#F59E0B', action: 'voted for Lauterbrunnen',       time: '1h ago',  icon: 'thumbs-up',        iconColor: '#F59E0B' },
  { id: 'a4', initials: 'BE', color: '#22C55E', action: 'joined the trip',               time: '2h ago',  icon: 'person-add',       iconColor: '#22C55E' },
];

// ── Expenses ──────────────────────────────────────────────────────────────────

type ExpenseCategory = 'food' | 'transport' | 'accommodation' | 'activity' | 'other';

type Expense = {
  id: string;
  title: string;
  amount: number;
  paidBy: string;
  splitWith: string[];
  category: ExpenseCategory;
  date: string;
};

const CATEGORY_META: Record<ExpenseCategory, { icon: string; color: string; bg: string; label: string }> = {
  food:          { icon: 'restaurant',        color: '#F97316', bg: '#FFF7ED', label: 'Food'        },
  transport:     { icon: 'car',               color: '#3B82F6', bg: '#EFF6FF', label: 'Transport'   },
  accommodation: { icon: 'bed',               color: '#6B3FA0', bg: '#EDE9F8', label: 'Stay'        },
  activity:      { icon: 'ticket',            color: '#10B981', bg: '#ECFDF5', label: 'Activity'    },
  other:         { icon: 'ellipsis-horizontal', color: '#9CA3AF', bg: '#F3F4F6', label: 'Other'     },
};

const ALL_IDS = MEMBERS.map((m) => m.id);


const MY_ID = 'jee';

function computeBalances(expenses: Expense[]) {
  return computeBalancesFor(expenses, MY_ID);
}

function computeBalancesFor(expenses: Expense[], myId: string) {
  // positive = they owe me; negative = I owe them
  const balances: Record<string, number> = {};
  for (const exp of expenses) {
    const share = exp.amount / exp.splitWith.length;
    if (exp.paidBy === myId) {
      for (const m of exp.splitWith) {
        if (m !== myId) balances[m] = (balances[m] ?? 0) + share;
      }
    } else if (exp.splitWith.includes(myId)) {
      balances[exp.paidBy] = (balances[exp.paidBy] ?? 0) - share;
    }
  }
  return balances;
}

function myTotalShare(expenses: Expense[]) {
  return expenses
    .filter((e) => e.splitWith.includes(MY_ID))
    .reduce((s, e) => s + e.amount / e.splitWith.length, 0);
}

function totalSpend(expenses: Expense[]) {
  return expenses.reduce((s, e) => s + e.amount, 0);
}

// ── Currencies ────────────────────────────────────────────────────────────────

type Currency = { code: string; symbol: string; name: string; flag: string; rate: number };

// Rates relative to CHF (base = 1.0)
const CURRENCIES: Currency[] = [
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc',   flag: '#E53E3E', rate: 1.000 },
  { code: 'EUR', symbol: '€',   name: 'Euro',          flag: '#3B82F6', rate: 0.970 },
  { code: 'USD', symbol: '$',   name: 'US Dollar',     flag: '#1D4ED8', rate: 1.120 },
  { code: 'GBP', symbol: '£',   name: 'British Pound', flag: '#7C3AED', rate: 0.870 },
  { code: 'JPY', symbol: '¥',   name: 'Japanese Yen',  flag: '#DC2626', rate: 168.50 },
  { code: 'KRW', symbol: '₩',   name: 'Korean Won',    flag: '#059669', rate: 1485.0 },
  { code: 'AUD', symbol: 'A$',  name: 'Australian $',  flag: '#D97706', rate: 1.720 },
  { code: 'CAD', symbol: 'C$',  name: 'Canadian $',    flag: '#B45309', rate: 1.530 },
];

function fmt(n: number, currency: Currency) {
  const converted = n * currency.rate;
  const decimals = ['JPY', 'KRW'].includes(currency.code) ? 0 : 2;
  return `${currency.symbol}${converted.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

// ── Drum date picker ─────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DRUM_ITEM_H = 44;
const DRUM_VISIBLE = 5;

function DrumColumn({ items, selectedIdx, onSelect, width }: { items: string[]; selectedIdx: number; onSelect: (i: number) => void; width: number }) {
  const ref = useRef<ScrollView>(null);
  const [activeIdx, setActiveIdx] = useState(selectedIdx);
  const firstRender = useRef(true);

  useEffect(() => {
    setActiveIdx(selectedIdx);
    const animated = !firstRender.current;
    const t = setTimeout(() => ref.current?.scrollTo({ y: selectedIdx * DRUM_ITEM_H, animated }), 60);
    firstRender.current = false;
    return () => clearTimeout(t);
  }, [selectedIdx]);

  return (
    <View style={{ width, height: DRUM_ITEM_H * DRUM_VISIBLE, overflow: 'hidden' }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={DRUM_ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: DRUM_ITEM_H * 2 }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const i = Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / DRUM_ITEM_H), items.length - 1));
          setActiveIdx(i);
        }}
        onMomentumScrollEnd={(e) => {
          const i = Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / DRUM_ITEM_H), items.length - 1));
          setActiveIdx(i);
          onSelect(i);
        }}
      >
        {items.map((item, i) => (
          <View key={i} style={{ height: DRUM_ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{
              fontSize: i === activeIdx ? 18 : 14,
              color: i === activeIdx ? '#1F0A40' : '#C4B5FD',
              fontWeight: i === activeIdx ? '800' : '400',
            }}>{item}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function DrumDateModal({ onClose, onSave, initialStart, initialEnd }: { onClose: () => void; onSave: (s: Date, e: Date) => void; initialStart?: Date | null; initialEnd?: Date | null }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];
  const [pickingStart, setPickingStart] = useState(true);
  const [sm, setSm] = useState(initialStart?.getMonth() ?? now.getMonth());
  const [sd, setSd] = useState((initialStart?.getDate() ?? now.getDate()) - 1);
  const [sy, setSy] = useState(Math.max(0, years.indexOf(initialStart?.getFullYear() ?? currentYear)));
  const [em, setEm] = useState(initialEnd?.getMonth() ?? (now.getMonth() + 1) % 12);
  const [ed, setEd] = useState((initialEnd?.getDate() ?? now.getDate()) - 1);
  const [ey, setEy] = useState(Math.max(0, years.indexOf(initialEnd?.getFullYear() ?? currentYear)));

  const daysIn = (month: number, yearIdx: number) =>
    Array.from({ length: new Date(years[yearIdx] ?? currentYear, month + 1, 0).getDate() }, (_, i) => String(i + 1));
  const startDays = daysIn(sm, sy);
  const endDays = daysIn(em, ey);

  // Derived day-of-week for the active selection
  const activeDayName = (() => {
    const m = pickingStart ? sm : em;
    const dIdx = pickingStart ? sd : ed;
    const yIdx = pickingStart ? sy : ey;
    const days = pickingStart ? startDays : endDays;
    const dayNum = parseInt(days[dIdx] ?? '1') || 1;
    return DAY_NAMES[new Date(years[yIdx] ?? currentYear, m, dayNum).getDay()];
  })();

  const handleSave = () => {
    const s = new Date(years[sy] ?? currentYear, sm, parseInt(startDays[sd] ?? '1') || 1);
    const e = new Date(years[ey] ?? currentYear, em, parseInt(endDays[ed] ?? '1') || 1);
    onSave(s, e);
  };

  return (
    <Modal visible transparent animationType="slide">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, backgroundColor: '#D1D5DB', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />
          <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 12 }}>Select Dates</Text>

          {/* Departure / Return toggle */}
          <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4 }}>
            {(['Departure', 'Return'] as const).map((label, i) => {
              const active = pickingStart === (i === 0);
              return (
                <TouchableOpacity key={label} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: active ? '#6B3FA0' : 'transparent', alignItems: 'center' }} onPress={() => setPickingStart(i === 0)}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#FFF' : '#6B7280' }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Day-of-week derived label */}
          <Text style={{ textAlign: 'center', fontSize: 22, fontWeight: '800', color: '#6B3FA0', marginBottom: 4, letterSpacing: 0.3 }}>
            {activeDayName}
          </Text>

          {/* Drum columns */}
          <View style={{ position: 'relative', marginHorizontal: 16 }}>
            {/* Selection highlight — rendered first so drums appear above */}
            <View pointerEvents="none" style={{
              position: 'absolute',
              top: DRUM_ITEM_H * 2,
              height: DRUM_ITEM_H,
              left: 0, right: 0,
              borderTopWidth: 1.5,
              borderBottomWidth: 1.5,
              borderColor: '#6B3FA0',
              borderRadius: 10,
            }} />
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <DrumColumn
                key={`month-${pickingStart ? 'start' : 'end'}`}
                items={MONTHS_SHORT}
                selectedIdx={pickingStart ? sm : em}
                onSelect={pickingStart ? setSm : setEm}
                width={88}
              />
              <DrumColumn
                key={`day-${pickingStart ? 'start' : 'end'}`}
                items={pickingStart ? startDays : endDays}
                selectedIdx={pickingStart ? sd : ed}
                onSelect={pickingStart ? setSd : setEd}
                width={56}
              />
              <DrumColumn
                key={`year-${pickingStart ? 'start' : 'end'}`}
                items={years.map(String)}
                selectedIdx={pickingStart ? sy : ey}
                onSelect={pickingStart ? setSy : setEy}
                width={80}
              />
            </View>
          </View>

          <TouchableOpacity style={{ marginHorizontal: 16, marginTop: 20, backgroundColor: '#6B3FA0', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }} onPress={handleSave}>
            <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>Save Dates</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ alignItems: 'center', paddingTop: 12 }} onPress={onClose}>
            <Text style={{ color: '#9CA3AF', fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function formatDrumDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}, ${end.getFullYear()}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function GroupScreen() {
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const {
    userId,
    profile,
    activeTrip,
    todayStops,
    members: liveMembers,
    expenses: liveExpenses,
    addExpense: saveExpense,
    updateTrip,
  } = useApp();

  const [petFriendly, setPetFriendly] = useState(true);
  const [myVote, setMyVote] = useState<string | null>(null);

  const hasRealTrip = !!activeTrip;
  const members = liveMembers;
  const expenses: Expense[] = liveExpenses.map((e) => ({
    id: e.id, title: e.title, amount: e.amount,
    paidBy: e.paidBy, splitWith: e.splitWith, category: e.category, date: e.date,
  }));

  // The current user's ID for "me" in balance calculations
  const MY_ID_LIVE = userId ?? MY_ID;

  // ── Plan with AI panel state ──
  type MiniMsg = { id: string; role: 'user' | 'ai'; text: string };
  const [chatOpen, setChatOpen] = useState(true);
  const [miniInput, setMiniInput] = useState('');
  const [miniMessages, setMiniMessages] = useState<MiniMsg[]>([]);
  const [miniTyping, setMiniTyping] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const miniScrollRef = useRef<ScrollView>(null);
  const chatPanelExpanded = screenHeight * 0.46;
  const chatPanelCollapsed = 56;
  const chatHeightAnim = useRef(new Animated.Value(chatPanelExpanded)).current;

  useEffect(() => {
    Animated.spring(chatHeightAnim, {
      toValue: chatOpen ? chatPanelExpanded : chatPanelCollapsed,
      useNativeDriver: false,
      friction: 8,
      tension: 60,
    }).start();
  }, [chatOpen, chatPanelExpanded]);

  const sendMiniMessage = async (text?: string) => {
    const content = (text ?? miniInput).trim();
    if (!content || miniTyping) return;
    setMiniInput('');
    setMiniTyping(true);
    const userMsg: MiniMsg = { id: `u_${Date.now()}`, role: 'user', text: content };
    setMiniMessages((prev) => [...prev, userMsg]);
    setTimeout(() => miniScrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const stopList = todayStops.length > 0
        ? todayStops.map((s) => `- ${s.time}: ${s.place_name}`).join('\n')
        : 'No stops planned yet.';
      const system = `You are Roamie, a warm travel companion. Trip: ${activeTrip?.name ?? 'a group trip'}. Dates: ${activeTrip?.dates_label ?? 'unknown'}. Today's plan:\n${stopList}\n\nReply conversationally in 1-3 sentences. Be friendly and specific. No markdown.`;
      const history: ClaudeMessage[] = miniMessages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));
      history.push({ role: 'user', content });
      const reply = await askClaude(system, history, 256);
      setMiniMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: 'ai', text: reply }]);
    } catch {
      setMiniMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: 'ai', text: "I couldn't connect right now — try the full chat." }]);
    }
    setMiniTyping(false);
    setTimeout(() => miniScrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  // ── Trip Set Up tile state ──
  const [setupOpen, setSetupOpen] = useState(false);
  const [tripName, setTripName] = useState(activeTrip?.name ?? '');
  const [tripThemes, setTripThemes] = useState<string[]>([]);
  const [themeInput, setThemeInput] = useState('');

  useEffect(() => {
    if (activeTrip?.name) setTripName(activeTrip.name);
  }, [activeTrip?.name]);

  const [showDateDrum, setShowDateDrum] = useState(false);
  const [drumStart, setDrumStart] = useState<Date | null>(null);
  const [drumEnd, setDrumEnd] = useState<Date | null>(null);

  const addTheme = () => {
    const val = themeInput.trim().replace(/^#/, '');
    if (val && !tripThemes.includes(val) && tripThemes.length < 3) {
      setTripThemes((prev) => [...prev, val]);
    }
    setThemeInput('');
  };

  const removeTheme = (tag: string) => {
    setTripThemes((prev) => prev.filter((t) => t !== tag));
  };

  const handleSaveSetup = async () => {
    if (!activeTrip) return;
    await updateTrip(activeTrip.id, {
      name: tripName.trim(),
      dates_label: activeTrip?.dates_label ?? null,
    });
  };

  // Add expense modal state
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showEditTrip, setShowEditTrip] = useState(false);
  const [editField, setEditField] = useState<'name' | 'dates'>('name');
  const [tripDates, setTripDates] = useState('');
  const [editValue, setEditValue] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);

  // Derive trip display values from context
  const displayTripName = activeTrip?.name ?? 'Swiss Summer Tour';
  const displayTripDates = activeTrip?.dates_label ?? 'Apr 2 – Apr 7, 2026';

  const TRIP_LINK = 'roamies-seven.vercel.app';

  const handleSendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || inviteSending) return;
    setInviteSending(true);
    try {
      // Send a magic-link sign-in email — recipient clicks it to open the app
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      // Record pending invite so we can add them to the trip on sign-in
      if (activeTrip) {
        await supabase.from('trip_invites').upsert({
          trip_id: activeTrip.id,
          invited_email: email,
          invited_by: userId,
          status: 'pending',
        });
      }
      setInviteSent(true);
      setTimeout(() => { setInviteSent(false); setInviteEmail(''); setShowInvite(false); }, 2500);
    } catch (e: any) {
      Alert.alert('Could not send invite', e?.message ?? 'Check the email and try again.');
    } finally {
      setInviteSending(false);
    }
  };

  const handleShareLink = async () => {
    try {
      await (await import('react-native')).Share.share({
        message: `Join our trip on Roamies! https://${TRIP_LINK}`,
        url: `https://${TRIP_LINK}`,
      });
    } catch { /* cancelled */ }
  };

  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newPaidBy, setNewPaidBy] = useState<string>(MY_ID_LIVE);
  const [newCategory, setNewCategory] = useState<ExpenseCategory>('food');
  const memberIds = members.map((m) => m.id);
  const [newSplit, setNewSplit] = useState<string[]>(memberIds.length ? memberIds : [...ALL_IDS]);

  // Currency state
  const [currency, setCurrency] = useState<Currency>(CURRENCIES[0]);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const balances = computeBalancesFor(expenses, MY_ID_LIVE);
  const netBalance = Object.values(balances).reduce((s, v) => s + v, 0);

  // Load persisted vote on mount
  useEffect(() => {
    if (!activeTrip || !userId) return;
    supabase
      .from('trip_ai_votes')
      .select('option_id')
      .eq('trip_id', activeTrip.id)
      .eq('user_id', userId)
      .eq('decision_key', 'main-activity-sunday')
      .maybeSingle()
      .then(({ data }) => { if (data) setMyVote(data.option_id); });
  }, [activeTrip?.id, userId]);

  const handleVote = async (optionId: string) => {
    const next = myVote === optionId ? null : optionId;
    setMyVote(next);
    if (!activeTrip || !userId) return;
    if (next) {
      await supabase.from('trip_ai_votes').upsert({
        trip_id: activeTrip.id,
        user_id: userId,
        decision_key: 'main-activity-sunday',
        option_id: next,
      }, { onConflict: 'trip_id,user_id,decision_key' });
    } else {
      await supabase.from('trip_ai_votes')
        .delete()
        .eq('trip_id', activeTrip.id)
        .eq('user_id', userId)
        .eq('decision_key', 'main-activity-sunday');
    }
  };

  const toggleSplit = (id: string) => {
    setNewSplit((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id],
    );
  };

  const confirmAddExpense = async () => {
    const amt = parseFloat(newAmount.replace(',', '.'));
    if (!newTitle.trim() || isNaN(amt) || amt <= 0) return;

    const today = new Date();
    const dateLabel = `${today.toLocaleString('default', { month: 'short' })} ${today.getDate()}`;

    if (hasRealTrip) {
      await saveExpense({
        title: newTitle.trim(),
        amount: amt,
        paidBy: newPaidBy,
        splitWith: newSplit,
        category: newCategory,
        date: dateLabel,
      });
    }
    // reset
    setNewTitle('');
    setNewAmount('');
    setNewPaidBy(MY_ID_LIVE);
    setNewCategory('food');
    setNewSplit(memberIds.length ? memberIds : [...ALL_IDS]);
    setShowAdd(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title={activeTrip?.name ?? 'Trip'}
        badge={tripCountdown(activeTrip?.dates_label)?.text}
        badgeActive={tripCountdown(activeTrip?.dates_label)?.active}
        avatarLabel={profile?.display_name
          ? profile.display_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
          : 'ME'}
        onAvatarPress={() => router.push('/(tabs)/me')}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Plan with AI Foldable Panel ── */}
        <Animated.View style={[styles.aiPanel, { height: chatHeightAnim }]}>
          {/* Panel header */}
          <View style={styles.aiPanelHeader}>
            <View style={styles.aiPanelHeaderLeft}>
              <View style={styles.aiIcon}>
                <Ionicons name="flash" size={16} color="#FFFFFF" />
              </View>
              <Text style={styles.aiPanelTitle}>Plan with AI ✦</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/ai')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
                style={{ backgroundColor: '#EDE9FE', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B3FA0' }}>Full chat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setChatOpen((v) => !v)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={chatOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#6B3FA0"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Expanded content */}
          {chatOpen && (
            <View style={styles.aiPanelContent}>

              {/* ── Message history ── */}
              <ScrollView
                ref={miniScrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {miniMessages.length === 0 && (
                  <Text style={styles.miniEmptyText}>Ask anything about your trip ✦</Text>
                )}
                {miniMessages.map((msg) => (
                  <View key={msg.id} style={msg.role === 'user' ? styles.miniUserRow : styles.miniAiRow}>
                    {msg.role === 'ai' && (
                      <View style={styles.miniAiAvatar}>
                        <Ionicons name="flash" size={10} color="#FFF" />
                      </View>
                    )}
                    <View style={[styles.miniMsgBubble, msg.role === 'user' ? styles.miniUserBubble : styles.miniAiBubble]}>
                      <Text style={msg.role === 'user' ? styles.miniUserText : styles.miniAiText}>{msg.text}</Text>
                    </View>
                  </View>
                ))}
                {miniTyping && (
                  <View style={styles.miniAiRow}>
                    <View style={styles.miniAiAvatar}>
                      <Ionicons name="flash" size={10} color="#FFF" />
                    </View>
                    <View style={[styles.miniMsgBubble, styles.miniAiBubble]}>
                      <Text style={styles.miniAiText}>•••</Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* ── Suggestions (collapsible) ── */}
              <View style={styles.miniSuggestSection}>
                <TouchableOpacity
                  style={styles.miniSuggestToggle}
                  onPress={() => setSuggestionsOpen((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.miniSuggestLabel}>Suggestions</Text>
                  <Ionicons name={suggestionsOpen ? 'chevron-down' : 'chevron-up'} size={13} color="#9CA3AF" />
                </TouchableOpacity>
                {suggestionsOpen && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.miniChipsRow}
                  >
                    {['Pet-friendly cafes', 'Best leave time', 'Dinner spots', 'Weather today'].map((chip) => (
                      <TouchableOpacity
                        key={chip}
                        style={styles.miniChip}
                        activeOpacity={0.8}
                        onPress={() => sendMiniMessage(chip)}
                      >
                        <Text style={styles.miniChipText}>{chip}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* ── Input row ── */}
              <View style={styles.aiInputRow}>
                <TextInput
                  style={styles.aiInput}
                  placeholder="Ask Roamie anything…"
                  placeholderTextColor="#9CA3AF"
                  value={miniInput}
                  onChangeText={setMiniInput}
                  returnKeyType="send"
                  onSubmitEditing={() => sendMiniMessage()}
                  editable={!miniTyping}
                />
                <TouchableOpacity
                  style={[styles.aiSendBtn, (!miniInput.trim() || miniTyping) && { opacity: 0.4 }]}
                  activeOpacity={0.85}
                  onPress={() => sendMiniMessage()}
                  disabled={!miniInput.trim() || miniTyping}
                >
                  <Ionicons name="send" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

            </View>
          )}
        </Animated.View>

        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* ── Activity Feed ── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Activity</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.activityCard}>
            {!hasRealTrip ? (
              <View style={{ paddingVertical: 20, alignItems: 'center', gap: 6 }}>
                <Ionicons name="pulse-outline" size={28} color="#C4B5FD" />
                <Text style={{ fontSize: 13, color: '#9CA3AF' }}>Activity will appear once you join a trip</Text>
              </View>
            ) : (
              ACTIVITY.map((item, index) => (
                <View key={item.id}>
                  <View style={styles.activityRow}>
                    <View style={[styles.activityAvatar, { backgroundColor: item.color }]}>
                      <Text style={styles.activityAvatarText}>{item.initials}</Text>
                    </View>
                    <Text style={styles.activityText} numberOfLines={2}>
                      <Text style={styles.activityName}>{item.initials === 'JE' ? 'You' : item.initials} </Text>
                      {item.action}
                    </Text>
                    <View style={styles.activityRight}>
                      <Ionicons name={item.icon as any} size={16} color={item.iconColor} />
                      <Text style={styles.activityTime}>{item.time}</Text>
                    </View>
                  </View>
                  {index < ACTIVITY.length - 1 && <View style={styles.activityDivider} />}
                </View>
              ))
            )}
          </View>
        </View>

        {/* ── Active Decisions ── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Active Decisions</Text>
            <View style={styles.decisionCountBadge}>
              <Text style={styles.decisionCountText}>1 open</Text>
            </View>
          </View>
          <View style={styles.decisionCard}>
            <Text style={styles.decisionTitle}>Main activity for Sunday</Text>
            <Text style={styles.decisionSub}>Voting ends in 14 hours</Text>

            {[
              { id: 'lauterbrunnen', name: 'Lauterbrunnen valley', votes: myVote === 'lauterbrunnen' ? 4 : 3, voters: ['EL', 'BE', 'DA'] },
              { id: 'iseltwald',    name: 'Iseltwald',             votes: myVote === 'iseltwald' ? 2 : 1,     voters: ['JE'] },
            ].map((opt) => {
              const isLeading = opt.id === 'lauterbrunnen';
              const isMyVote = myVote === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optionRow, isMyVote && styles.optionRowVoted]}
                  onPress={() => handleVote(opt.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.optionCheck, isLeading && styles.optionCheckLeading, isMyVote && styles.optionCheckVoted]}>
                    {isLeading || isMyVote
                      ? <Ionicons name="checkmark" size={13} color="#fff" />
                      : <View style={styles.optionDot} />
                    }
                  </View>
                  <Text style={[styles.optionName, isMyVote && styles.optionNameVoted]}>{opt.name}</Text>
                  <View style={styles.voters}>
                    {opt.voters.slice(0, 3).map((v) => (
                      <View key={v} style={[styles.voterChip, { backgroundColor: VOTER_COLORS[v] ?? '#9CA3AF' }]}>
                        <Text style={styles.voterText}>{v}</Text>
                      </View>
                    ))}
                    {isMyVote && (
                      <View style={[styles.voterChip, { backgroundColor: '#6B3FA0' }]}>
                        <Text style={styles.voterText}>JE</Text>
                      </View>
                    )}
                    <Text style={styles.voteCount}>{opt.votes}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.voteHint}>{myVote ? 'Tap your vote to undo' : 'Tap an option to vote'}</Text>
          </View>
        </View>

        {/* ── Expenses ── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Expenses</Text>
            <TouchableOpacity style={styles.currencyBtn} onPress={() => setShowCurrencyPicker(true)} activeOpacity={0.8}>
              <View style={[styles.currencyDot, { backgroundColor: currency.flag }]} />
              <Text style={styles.currencyBtnText}>{currency.code}</Text>
              <Ionicons name="chevron-down" size={12} color="#6B3FA0" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addExpenseBtn} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
              <Ionicons name="add" size={16} color="#6B3FA0" />
              <Text style={styles.addExpenseBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Summary card */}
          <View style={styles.expenseSummaryCard}>
            <View style={styles.expenseSummaryRow}>
              <View style={styles.expenseSummaryItem}>
                <Text style={styles.expenseSummaryLabel}>TRIP TOTAL</Text>
                <Text style={styles.expenseSummaryValue}>{fmt(totalSpend(expenses), currency)}</Text>
              </View>
              <View style={styles.expenseSummaryDivider} />
              <View style={styles.expenseSummaryItem}>
                <Text style={styles.expenseSummaryLabel}>YOUR SHARE</Text>
                <Text style={[styles.expenseSummaryValue, { color: '#6B3FA0' }]}>{fmt(myTotalShare(expenses), currency)}</Text>
              </View>
              <View style={styles.expenseSummaryDivider} />
              <View style={styles.expenseSummaryItem}>
                <Text style={styles.expenseSummaryLabel}>NET BALANCE</Text>
                <Text style={[styles.expenseSummaryValue, netBalance >= 0 ? styles.balancePositive : styles.balanceNegative]}>
                  {netBalance >= 0 ? '+' : ''}{fmt(Math.abs(netBalance), currency)}
                </Text>
              </View>
            </View>
          </View>

          {/* Per-person balances */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceCardTitle}>Settle Up</Text>
            {members.filter((m) => m.id !== MY_ID_LIVE).map((member) => {
              const bal = balances[member.id] ?? 0;
              if (Math.abs(bal) < 0.01) return null;
              const owesMe = bal > 0;
              return (
                <View key={member.id} style={styles.balanceRow}>
                  <View style={[styles.balanceAvatar, { backgroundColor: member.color }]}>
                    <Text style={styles.balanceAvatarText}>{member.initials}</Text>
                  </View>
                  <View style={styles.balanceInfo}>
                    <Text style={styles.balanceName}>{member.name}</Text>
                    <Text style={[styles.balanceDirection, owesMe ? styles.balanceOwesMe : styles.balanceIOwe]}>
                      {owesMe ? 'owes you' : 'you owe'}
                    </Text>
                  </View>
                  <Text style={[styles.balanceAmount, owesMe ? styles.balancePositive : styles.balanceNegative]}>
                    {fmt(Math.abs(bal), currency)}
                  </Text>
                  {owesMe && (
                    <TouchableOpacity
                      style={styles.remindBtn}
                      activeOpacity={0.8}
                      onPress={() =>
                        Share.share({
                          message: `Hey ${member.name}! Just a reminder — you owe ${fmt(Math.abs(bal), currency)} on the ${activeTrip?.name ?? 'trip'} expenses. Let me know when you can settle up 🙏`,
                        })
                      }
                    >
                      <Text style={styles.remindBtnText}>Remind</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          {/* Expense list */}
          <View style={styles.expenseListCard}>
            {expenses.map((exp, index) => {
              const payer = members.find((m) => m.id === exp.paidBy) ?? MEMBER_MAP[exp.paidBy as MemberId];
              const cat = CATEGORY_META[exp.category];
              const myShare = exp.splitWith.includes(MY_ID_LIVE) ? exp.amount / exp.splitWith.length : 0;
              return (
                <View key={exp.id}>
                  <View style={styles.expenseRow}>
                    {/* Category icon */}
                    <View style={[styles.expenseCatIcon, { backgroundColor: cat.bg }]}>
                      <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                    </View>

                    {/* Content */}
                    <View style={styles.expenseContent}>
                      <Text style={styles.expenseTitle}>{exp.title}</Text>
                      <View style={styles.expenseMeta}>
                        <View style={[styles.expensePayerDot, { backgroundColor: payer?.color ?? '#9CA3AF' }]}>
                          <Text style={styles.expensePayerInitials}>{payer?.initials ?? '?'}</Text>
                        </View>
                        <Text style={styles.expenseMetaText}>
                          {payer?.id === MY_ID_LIVE ? 'You paid' : `${payer?.name ?? 'Someone'} paid`}  ·  {exp.date}
                        </Text>
                      </View>
                    </View>

                    {/* Amounts */}
                    <View style={styles.expenseAmounts}>
                      <Text style={styles.expenseTotal}>{fmt(exp.amount, currency)}</Text>
                      {myShare > 0 && (
                        <Text style={styles.expenseMyShare}>your share {fmt(myShare, currency)}</Text>
                      )}
                    </View>
                  </View>
                  {index < expenses.length - 1 && <View style={styles.expenseDivider} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Trip Set Up ── */}
        <View style={styles.setupTile}>
          <TouchableOpacity
            style={styles.setupTileHeader}
            onPress={() => setSetupOpen((v) => !v)}
            activeOpacity={0.8}
          >
            <Text style={styles.setupTileTitle}>Trip Set Up</Text>
            <View style={styles.memberCountBadge}>
              <Text style={styles.memberCountBadgeText}>{members.length} members</Text>
            </View>
            <Ionicons name={setupOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#6B3FA0" />
          </TouchableOpacity>

          {setupOpen && (
            <View style={styles.setupTileBody}>
              {/* Trip Name */}
              <Text style={styles.setupSectionLabel}>TRIP NAME</Text>
              <TextInput
                style={styles.setupTextInput}
                value={tripName}
                onChangeText={setTripName}
                placeholder="Name your trip"
                placeholderTextColor="#9CA3AF"
              />

              <View style={styles.setupDivider} />

              {/* Dates */}
              <Text style={styles.setupSectionLabel}>DATES</Text>
              <View style={styles.setupDatesRow}>
                <Text style={styles.setupDatesValue}>
                  {drumStart && drumEnd ? formatDrumDateRange(drumStart, drumEnd) : displayTripDates}
                </Text>
                <TouchableOpacity
                  style={styles.setupChangeDatesBtn}
                  onPress={() => setShowDateDrum(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.setupChangeDatesBtnText}>Change dates</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.setupDivider} />

              {/* Vibes */}
              <Text style={styles.setupSectionLabel}>TRIP VIBES</Text>
              <View style={styles.tagChipsRow}>
                {tripThemes.map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>#{tag}</Text>
                    <TouchableOpacity onPress={() => removeTheme(tag)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={14} color="#6B3FA0" />
                    </TouchableOpacity>
                  </View>
                ))}
                {tripThemes.length < 3 && (
                  <View style={styles.tagInputRow}>
                    <Text style={styles.tagInputHash}>#</Text>
                    <TextInput
                      style={styles.tagInput}
                      value={themeInput}
                      onChangeText={setThemeInput}
                      placeholder="add vibe"
                      placeholderTextColor="#C4B5FD"
                      returnKeyType="done"
                      onSubmitEditing={addTheme}
                    />
                  </View>
                )}
              </View>

              <View style={styles.setupDivider} />

              {/* Pet Friendly */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.setupFieldLabel, { flex: 1 }]}>Pet-friendly options</Text>
                <Switch
                  value={petFriendly}
                  onValueChange={setPetFriendly}
                  trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
                  thumbColor={petFriendly ? '#6B3FA0' : '#9CA3AF'}
                />
              </View>

              <View style={styles.setupDivider} />

              {/* Members */}
              <Text style={styles.setupSectionLabel}>MEMBERS</Text>
              {members.map((m) => (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.memberAvatar, { width: 34, height: 34, borderRadius: 17, backgroundColor: m.color }]}>
                    <Text style={styles.memberAvatarText}>{m.initials}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, color: '#111827', fontWeight: '600' }}>{m.name}</Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '600', letterSpacing: 0.4 }}>{m.role}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={() => setShowInvite(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add-outline" size={18} color="#6B3FA0" />
                <Text style={styles.inviteText}>Invite someone</Text>
              </TouchableOpacity>

              {/* Save */}
              <TouchableOpacity style={styles.setupSaveBtn} onPress={handleSaveSetup} activeOpacity={0.85}>
                <Text style={styles.setupSaveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {showDateDrum && (
        <DrumDateModal
          initialStart={drumStart}
          initialEnd={drumEnd}
          onClose={() => setShowDateDrum(false)}
          onSave={(s, e) => { setDrumStart(s); setDrumEnd(e); setShowDateDrum(false); }}
        />
      )}

      {/* ── Add Expense Modal ── */}
      <Modal visible={showAdd} animationType="slide" transparent presentationStyle="overFullScreen">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowAdd(false)} />
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Expense</Text>

            {/* Title */}
            <TextInput
              style={styles.sheetInput}
              placeholder="What was it for?"
              placeholderTextColor="#9CA3AF"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            {/* Amount */}
            <TextInput
              style={styles.sheetInput}
              placeholder="Amount (CHF)"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              value={newAmount}
              onChangeText={setNewAmount}
            />

            {/* Category */}
            <Text style={styles.sheetLabel}>Category</Text>
            <View style={styles.catRow}>
              {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map((cat) => {
                const meta = CATEGORY_META[cat];
                const active = newCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, active && { backgroundColor: meta.bg, borderColor: meta.color }]}
                    onPress={() => setNewCategory(cat)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={meta.icon as any} size={16} color={active ? meta.color : '#9CA3AF'} />
                    <Text style={[styles.catChipText, active && { color: meta.color }]}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Paid by */}
            <Text style={styles.sheetLabel}>Paid by</Text>
            <View style={styles.memberChipRow}>
              {members.map((m) => {
                const active = newPaidBy === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.memberChip, active && { backgroundColor: m.color }]}
                    onPress={() => setNewPaidBy(m.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.memberChipText, active && styles.memberChipTextActive]}>
                      {m.id === MY_ID_LIVE ? 'You' : m.name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Split with */}
            <Text style={styles.sheetLabel}>Split with</Text>
            <View style={styles.memberChipRow}>
              {members.map((m) => {
                const active = newSplit.includes(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.memberChip, active && { backgroundColor: m.color }]}
                    onPress={() => toggleSplit(m.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.memberChipText, active && styles.memberChipTextActive]}>
                      {m.id === MY_ID_LIVE ? 'You' : m.name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Confirm */}
            <TouchableOpacity
              style={[styles.confirmBtn, (!newTitle.trim() || !newAmount) && styles.confirmBtnDisabled]}
              onPress={confirmAddExpense}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>Add Expense</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Trip Modal ── */}
      <Modal visible={showEditTrip} animationType="slide" transparent presentationStyle="overFullScreen">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowEditTrip(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editField === 'name' ? 'Edit Trip Name' : 'Edit Dates'}</Text>
            <TextInput
              style={styles.sheetInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={editField === 'name' ? 'Trip name' : 'e.g. Apr 2 — Apr 7, 2026'}
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.confirmBtn, !editValue.trim() && styles.confirmBtnDisabled]}
              activeOpacity={0.85}
              onPress={() => {
                if (!editValue.trim()) return;
                if (editField === 'name') setTripName(editValue.trim());
                else setTripDates(editValue.trim());
                setShowEditTrip(false);
              }}
            >
              <Text style={styles.confirmBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Invite Member Modal ── */}
      <Modal visible={showInvite} animationType="slide" transparent presentationStyle="overFullScreen">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => { setShowInvite(false); setInviteEmail(''); setInviteSent(false); }} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Invite to Trip</Text>
            <Text style={styles.inviteSubtitle}>Strasbourg → Switzerland · Apr 2–7</Text>

            {/* Email invite */}
            <Text style={styles.sheetLabel}>Invite by email</Text>
            <View style={styles.inviteInputRow}>
              <View style={styles.inviteInputBox}>
                <Ionicons name="mail-outline" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.inviteInput}
                  placeholder="friend@email.com"
                  placeholderTextColor="#9CA3AF"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <TouchableOpacity
                style={[styles.inviteSendBtn, (!inviteEmail.trim() || inviteSent || inviteSending) && styles.inviteSendBtnDisabled]}
                onPress={handleSendInvite}
                activeOpacity={0.85}
                disabled={!inviteEmail.trim() || inviteSent || inviteSending}
              >
                {inviteSent
                  ? <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  : inviteSending
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.inviteSendBtnText}>Send</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.inviteDividerRow}>
              <View style={styles.inviteDividerLine} />
              <Text style={styles.inviteDividerText}>OR SHARE LINK</Text>
              <View style={styles.inviteDividerLine} />
            </View>

            {/* Link + share buttons */}
            <View style={styles.inviteLinkBox}>
              <Ionicons name="link-outline" size={14} color="#6B7280" />
              <Text style={styles.inviteLinkText} numberOfLines={1}>{TRIP_LINK}</Text>
            </View>

            <View style={styles.inviteShareRow}>
              {[
                { label: 'Messages', icon: 'chatbubble' },
                { label: 'WhatsApp', icon: 'logo-whatsapp' },
                { label: 'More',     icon: 'share-social'  },
              ].map((ch) => (
                <TouchableOpacity key={ch.label} style={styles.inviteShareBtn} onPress={handleShareLink} activeOpacity={0.8}>
                  <View style={styles.inviteShareIcon}>
                    <Ionicons name={ch.icon as any} size={20} color="#6B3FA0" />
                  </View>
                  <Text style={styles.inviteShareLabel}>{ch.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Currency Picker Modal ── */}
      <Modal visible={showCurrencyPicker} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowCurrencyPicker(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Display Currency</Text>
            <Text style={styles.currencyPickerNote}>
              Amounts are stored in CHF and converted at approximate rates for display only.
            </Text>
            {CURRENCIES.map((c) => {
              const active = c.code === currency.code;
              return (
                <TouchableOpacity
                  key={c.code}
                  style={[styles.currencyRow, active && styles.currencyRowActive]}
                  onPress={() => { setCurrency(c); setShowCurrencyPicker(false); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.currencyFlagBadge, { backgroundColor: c.flag }]}>
                    <Text style={styles.currencyFlagBadgeText}>{c.code.slice(0, 2)}</Text>
                  </View>
                  <View style={styles.currencyRowInfo}>
                    <Text style={[styles.currencyRowCode, active && { color: '#6B3FA0' }]}>{c.code}</Text>
                    <Text style={styles.currencyRowName}>{c.name}</Text>
                  </View>
                  <Text style={styles.currencyRowRate}>
                    1 CHF = {c.rate >= 10 ? c.rate.toFixed(0) : c.rate.toFixed(3)} {c.code}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color="#6B3FA0" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEEEF6' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerTripName: { flex: 1, fontSize: 17, fontWeight: '800', color: '#111827' },

  // ── Plan with AI panel ────────────────────────────────────────────────────
  aiPanel: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9F8',
    shadowColor: '#6B3FA0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginHorizontal: -16,
  },
  aiPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 56,
  },
  aiPanelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  aiPanelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  aiIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#6B3FA0',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  aiPanelContent: {
    flex: 1,
    paddingBottom: 12,
    paddingHorizontal: 0,
  },

  // Mini chat messages
  miniEmptyText: {
    textAlign: 'center',
    color: '#C4B5FD',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 24,
  },
  miniUserRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  miniAiRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  miniAiAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },
  miniMsgBubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  miniUserBubble: {
    backgroundColor: '#6B3FA0',
    borderBottomRightRadius: 4,
  },
  miniAiBubble: {
    backgroundColor: '#F3F0FA',
    borderBottomLeftRadius: 4,
  },
  miniUserText: {
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 18,
  },
  miniAiText: {
    fontSize: 13,
    color: '#1F0A40',
    lineHeight: 18,
  },

  // Suggestions section
  miniSuggestSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EDE9F8',
    paddingTop: 6,
    paddingBottom: 4,
  },
  miniSuggestToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingBottom: 5,
  },
  miniSuggestLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.3,
  },
  miniChipsRow: {
    paddingHorizontal: 12,
    gap: 6,
    paddingBottom: 2,
  },
  miniChip: {
    backgroundColor: '#F5F0FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  miniChipText: {
    fontSize: 12,
    color: '#6B3FA0',
    fontWeight: '600',
  },

  aiInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  aiInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 38,
    fontSize: 14,
    color: '#111827',
  },
  aiSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  aiFullChatLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  aiFullChatLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B3FA0',
  },

  // Drag handle
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginVertical: 8,
  },

  // ── Trip Set Up tile ──────────────────────────────────────────────────────
  setupTile: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  setupTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  setupTileTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  memberCountBadge: {
    backgroundColor: '#EDE9F8',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 4,
  },
  memberCountBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B3FA0',
  },
  setupTileBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  setupSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  setupDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },
  setupFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.3,
  },
  setupFieldDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: -4,
  },
  setupTextInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  setupDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  setupDatesValue: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  setupChangeDatesBtn: {
    backgroundColor: '#EDE9F8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  setupChangeDatesBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B3FA0',
  },
  tagChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: '#EDE9F8',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagChipText: {
    fontSize: 13,
    color: '#6B3FA0',
    fontWeight: '600',
  },
  tagChipRemove: {
    fontSize: 16,
    color: '#6B3FA0',
    fontWeight: '700',
    lineHeight: 18,
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9F8',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 2,
  },
  tagInputHash: {
    fontSize: 13,
    color: '#6B3FA0',
    fontWeight: '700',
  },
  tagInput: {
    minWidth: 60,
    fontSize: 13,
    color: '#111827',
    paddingVertical: 0,
  },
  setupSaveBtn: {
    backgroundColor: '#6B3FA0',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  setupSaveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  avatarBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#6B3FA0',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  scroll: { paddingHorizontal: 16, gap: 20, paddingBottom: 16 },

  section: { gap: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', flex: 1 },
  travelingBadge: { fontSize: 14, fontWeight: '600', color: '#6B3FA0' },

  // Member card
  memberCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  memberAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  memberAvatarText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  memberRole: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.5 },
  memberRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusLive: { backgroundColor: '#DCFCE7' },
  statusOff: { backgroundColor: '#F3F4F6' },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statusTextLive: { color: '#16A34A' },
  statusTextOff: { color: '#6B7280' },
  locationText: { fontSize: 11, color: '#6B7280', maxWidth: 110, textAlign: 'right' },

  inviteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 16,
    borderWidth: 1.5, borderColor: '#DDD6F3', borderStyle: 'dashed',
  },
  inviteText: { fontSize: 15, fontWeight: '600', color: '#6B3FA0' },

  // Activity
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  liveText: { fontSize: 10, fontWeight: '700', color: '#16A34A', letterSpacing: 0.5 },
  activityCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  activityAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityAvatarText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  activityText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 18 },
  activityName: { fontWeight: '700', color: '#111827' },
  activityRight: { alignItems: 'center', gap: 4, flexShrink: 0 },
  activityTime: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  activityDivider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 },

  // Decisions
  decisionCountBadge: { backgroundColor: '#EDE9F8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  decisionCountText: { fontSize: 12, fontWeight: '600', color: '#6B3FA0' },
  decisionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  decisionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  decisionSub: { fontSize: 13, color: '#6B7280', marginTop: -4 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  optionRowVoted: { backgroundColor: '#FDFCFF', borderColor: '#DDD6F3' },
  optionCheck: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  optionCheckLeading: { backgroundColor: '#6B3FA0' },
  optionCheckVoted: { backgroundColor: '#6B3FA0' },
  optionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9CA3AF' },
  optionName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827' },
  optionNameVoted: { fontWeight: '700' },
  voters: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voterChip: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  voterText: { fontSize: 8, fontWeight: '700', color: '#FFFFFF' },
  voteCount: { fontSize: 15, fontWeight: '700', color: '#374151', marginLeft: 4 },
  voteHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 2 },

  // ── Expenses ──────────────────────────────────────────────────────────────

  addExpenseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE9F8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  addExpenseBtnText: { fontSize: 13, fontWeight: '700', color: '#6B3FA0' },

  // Summary
  expenseSummaryCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  expenseSummaryRow: { flexDirection: 'row', alignItems: 'center' },
  expenseSummaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  expenseSummaryDivider: { width: 1, height: 36, backgroundColor: '#F3F4F6' },
  expenseSummaryLabel: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8 },
  expenseSummaryValue: { fontSize: 16, fontWeight: '800', color: '#111827' },
  balancePositive: { color: '#16A34A' },
  balanceNegative: { color: '#EF4444' },

  // Settle up
  balanceCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  balanceCardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balanceAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  balanceAvatarText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  balanceInfo: { flex: 1, gap: 2 },
  balanceName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  balanceDirection: { fontSize: 12 },
  balanceOwesMe: { color: '#16A34A' },
  balanceIOwe: { color: '#EF4444' },
  balanceAmount: { fontSize: 15, fontWeight: '700' },
  remindBtn: {
    backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
  },
  remindBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },

  // Expense list
  expenseListCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  expenseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  expenseCatIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  expenseContent: { flex: 1, gap: 4 },
  expenseTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  expenseMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expensePayerDot: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  expensePayerInitials: { fontSize: 7, fontWeight: '700', color: '#FFFFFF' },
  expenseMetaText: { fontSize: 12, color: '#6B7280' },
  expenseAmounts: { alignItems: 'flex-end', gap: 2 },
  expenseTotal: { fontSize: 15, fontWeight: '700', color: '#111827' },
  expenseMyShare: { fontSize: 11, color: '#9CA3AF' },
  expenseDivider: { height: 1, backgroundColor: '#F9FAFB', marginHorizontal: 16 },

  // ── Knowledge Base ────────────────────────────────────────────────────────
  featuredNote: { backgroundColor: '#6B3FA0', borderRadius: 20, padding: 20, gap: 10 },
  featuredNoteText: { fontSize: 15, fontWeight: '500', color: '#FFFFFF', lineHeight: 22, fontStyle: 'italic' },
  notesGrid: { flexDirection: 'row', gap: 10 },
  noteCard: { flex: 1, borderRadius: 16, padding: 14, gap: 6 },
  noteWeather: { backgroundColor: '#FEF3C7' },
  noteDining: { backgroundColor: '#F3F4F6' },
  noteLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: '#6B7280' },
  noteText: { fontSize: 13, fontWeight: '600', color: '#111827', lineHeight: 18 },

  // ── Trip config ───────────────────────────────────────────────────────────
  configCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  configRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  configContent: { flex: 1, gap: 2 },
  configLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.8 },
  configValue: { fontSize: 16, fontWeight: '700', color: '#111827' },
  configSub: { fontSize: 12, color: '#6B7280' },
  configDivider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 },

  // ── Add Expense Modal ─────────────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 4,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  sheetLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6, marginTop: 2 },
  sheetInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#111827',
  },

  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#F9FAFB',
  },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },

  memberChipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  memberChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  memberChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  memberChipTextActive: { color: '#FFFFFF' },

  confirmBtn: {
    backgroundColor: '#6B3FA0', borderRadius: 18, paddingVertical: 18,
    alignItems: 'center', marginTop: 4,
    shadowColor: '#6B3FA0', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  confirmBtnDisabled: { backgroundColor: '#C4B5D4', shadowOpacity: 0 },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // ── Invite modal ─────────────────────────────────────────────────────────
  inviteSubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: -8 },
  inviteInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteInputBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  inviteInput: { flex: 1, fontSize: 14, color: '#111827' },
  inviteSendBtn: {
    backgroundColor: '#6B3FA0', borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  inviteSendBtnDisabled: { backgroundColor: '#C4B5D4' },
  inviteSendBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  inviteDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteDividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  inviteDividerText: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8 },
  inviteLinkBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inviteLinkText: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },
  inviteShareRow: { flexDirection: 'row', gap: 10 },
  inviteShareBtn: { flex: 1, alignItems: 'center', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 16, paddingVertical: 14 },
  inviteShareIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#EDE9F8', alignItems: 'center', justifyContent: 'center',
  },
  inviteShareLabel: { fontSize: 11, fontWeight: '700', color: '#374151', letterSpacing: 0.4 },

  // ── Currency button ───────────────────────────────────────────────────────
  currencyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE9F8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  currencyDot: { width: 10, height: 10, borderRadius: 5 },
  currencyBtnText: { fontSize: 13, fontWeight: '700', color: '#6B3FA0' },

  // ── Currency picker ───────────────────────────────────────────────────────
  currencyPickerNote: {
    fontSize: 12, color: '#9CA3AF', lineHeight: 17, marginTop: -6,
  },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent',
  },
  currencyRowActive: {
    backgroundColor: '#FDFCFF', borderColor: '#DDD6F3',
    paddingHorizontal: 10,
  },
  currencyFlagBadge: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  currencyFlagBadgeText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  currencyRowInfo: { flex: 1, gap: 1 },
  currencyRowCode: { fontSize: 15, fontWeight: '700', color: '#111827' },
  currencyRowName: { fontSize: 12, color: '#9CA3AF' },
  currencyRowRate: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
});
