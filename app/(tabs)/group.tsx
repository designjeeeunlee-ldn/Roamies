import { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import ScreenHeader from '../../components/ScreenHeader';
import { formatTripDates, tripCountdown } from '../../lib/dateFormat';

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

const INITIAL_EXPENSES: Expense[] = [
  { id: 'e1', title: 'Fondue dinner',          amount: 112.50, paidBy: 'jee',    splitWith: ALL_IDS,                         category: 'food',          date: 'Apr 3' },
  { id: 'e2', title: 'Train to Lucerne',       amount:  84.00, paidBy: 'ben',    splitWith: ALL_IDS,                         category: 'transport',     date: 'Apr 4' },
  { id: 'e3', title: 'Therme Zurzach entry',   amount:  64.00, paidBy: 'eliska', splitWith: ['jee', 'ben', 'eliska'],        category: 'activity',      date: 'Apr 4' },
  { id: 'e4', title: 'Hotel Luzern (2 nights)',amount: 320.00, paidBy: 'david',  splitWith: ALL_IDS,                         category: 'accommodation', date: 'Apr 4' },
  { id: 'e5', title: 'Breakfast at Markt',     amount:  48.00, paidBy: 'jee',    splitWith: ALL_IDS,                         category: 'food',          date: 'Apr 5' },
];

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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function GroupScreen() {
  const router = useRouter();
  const {
    userId,
    profile,
    activeTrip,
    members: liveMembers,
    expenses: liveExpenses,
    addExpense: saveExpense,
  } = useApp();

  const [petFriendly, setPetFriendly] = useState(true);
  const [myVote, setMyVote] = useState<string | null>('iseltwald');

  // Use real data when trip exists, otherwise fall back to demo data
  const hasRealTrip = !!activeTrip;
  const members = hasRealTrip ? liveMembers : MEMBERS as unknown as typeof liveMembers;
  const expenses: Expense[] = hasRealTrip
    ? liveExpenses.map((e) => ({ id: e.id, title: e.title, amount: e.amount, paidBy: e.paidBy, splitWith: e.splitWith, category: e.category, date: e.date }))
    : INITIAL_EXPENSES;

  // The current user's ID for "me" in balance calculations
  const MY_ID_LIVE = userId ?? MY_ID;

  // Add expense modal state
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showEditTrip, setShowEditTrip] = useState(false);
  const [editField, setEditField] = useState<'name' | 'dates'>('name');
  const [tripName, setTripName] = useState('');
  const [tripDates, setTripDates] = useState('');
  const [editValue, setEditValue] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSent, setInviteSent] = useState(false);

  // Derive trip display values from context
  const displayTripName = activeTrip?.name ?? 'Swiss Summer Tour';
  const displayTripDates = activeTrip?.dates_label ?? 'Apr 2 – Apr 7, 2026';

  const TRIP_LINK = 'roamies.app/swiss-tour-2026';

  const handleSendInvite = () => {
    if (!inviteEmail.trim()) return;
    setInviteSent(true);
    setTimeout(() => { setInviteSent(false); setInviteEmail(''); setShowInvite(false); }, 1800);
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

  const handleVote = (optionId: string) => setMyVote((prev) => (prev === optionId ? null : optionId));

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

        {/* ── AI Co-Planner ── */}
        <TouchableOpacity
          style={styles.aiCard}
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)/ai')}
        >
          <View style={styles.aiCardLeft}>
            <View style={styles.aiIcon}>
              <Ionicons name="flash" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.aiCardText}>
              <Text style={styles.aiCardTitle}>Plan with AI ✦</Text>
              <Text style={styles.aiCardSub}>Suggestions, timing checks, drop in a booking PDF</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#6B3FA0" />
        </TouchableOpacity>

        {/* ── Trip Members ── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Trip Members</Text>
            <Text style={styles.travelingBadge}>{members.length} Traveling</Text>
          </View>

          {members.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={[styles.memberAvatar, { backgroundColor: member.color }]}>
                <Text style={styles.memberAvatarText}>{member.initials}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberRole}>{member.role.toUpperCase()}</Text>
              </View>
              <View style={styles.memberRight}>
                <View style={[styles.statusBadge, styles.statusOff]}>
                  <Text style={[styles.statusText, styles.statusTextOff]}>MEMBER</Text>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.inviteButton} activeOpacity={0.8} onPress={() => setShowInvite(true)}>
            <Ionicons name="person-add-outline" size={18} color="#6B3FA0" />
            <Text style={styles.inviteText}>Invite Member</Text>
          </TouchableOpacity>
        </View>

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
            {ACTIVITY.map((item, index) => (
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
            ))}
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
                    <TouchableOpacity style={styles.remindBtn} activeOpacity={0.8}>
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

        {/* ── Trip Settings ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Settings</Text>
          <View style={styles.configCard}>
            <TouchableOpacity style={styles.configRow} activeOpacity={0.7} onPress={() => { setEditField('name'); setEditValue(displayTripName); setShowEditTrip(true); }}>
              <View style={styles.configContent}>
                <Text style={styles.configLabel}>TRIP NAME</Text>
                <Text style={styles.configValue}>{tripName || displayTripName}</Text>
              </View>
              <Ionicons name="pencil-outline" size={18} color="#9CA3AF" />
            </TouchableOpacity>
            <View style={styles.configDivider} />
            <TouchableOpacity style={styles.configRow} activeOpacity={0.7} onPress={() => { setEditField('dates'); setEditValue(displayTripDates); setShowEditTrip(true); }}>
              <View style={styles.configContent}>
                <Text style={styles.configLabel}>DATES</Text>
                <Text style={styles.configValue}>{tripDates || displayTripDates}</Text>
              </View>
              <Ionicons name="calendar-outline" size={18} color="#9CA3AF" />
            </TouchableOpacity>
            <View style={styles.configDivider} />
            <View style={styles.configRow}>
              <View style={styles.configContent}>
                <Text style={styles.configValue}>Pet Friendly Planning</Text>
                <Text style={styles.configSub}>Show dog-friendly trails & stays</Text>
              </View>
              <Switch
                value={petFriendly}
                onValueChange={setPetFriendly}
                trackColor={{ false: '#D1D5DB', true: '#6B3FA0' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

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
                style={[styles.inviteSendBtn, (!inviteEmail.trim() || inviteSent) && styles.inviteSendBtnDisabled]}
                onPress={handleSendInvite}
                activeOpacity={0.85}
              >
                {inviteSent
                  ? <Ionicons name="checkmark" size={18} color="#FFFFFF" />
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

  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDFCFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#DDD6F3',
    gap: 12,
  },
  aiCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#6B3FA0',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  aiCardText: { flex: 1, gap: 2 },
  aiCardTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  aiCardSub: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
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
