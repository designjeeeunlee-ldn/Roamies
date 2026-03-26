import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function SignInScreen() {
  const router = useRouter();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailContinue = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      if (isNewAccount) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) { setError(signUpError.message); return; }
        // If email confirmation is required, session will be null
        if (!data.session) {
          setError('Check your email for a confirmation link, then sign in.');
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) { setError(signInError.message); return; }
      }
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSkip = () => router.replace('/(tabs)');

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim());
    setForgotLoading(false);
    if (resetError) { setError(resetError.message); setShowForgot(false); return; }
    setForgotSent(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

          {/* Top section — lavender */}
          <View style={styles.top}>
            <View style={styles.logoCircle}>
              <Ionicons name="navigate" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>Roamies</Text>
            <Text style={styles.tagline}>Plan together.{'\n'}Travel better.</Text>
          </View>

          {/* Auth section */}
          <View style={styles.authSection}>
            {!showEmailForm ? (
              <>
                {/* Social buttons */}
                <TouchableOpacity style={styles.socialBtn} activeOpacity={0.85} onPress={() => Alert.alert('Coming soon', 'Apple Sign In will be available at launch.')}>
                  <Ionicons name="logo-apple" size={20} color="#111827" />
                  <Text style={styles.socialBtnText}>Continue with Apple</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.socialBtn} activeOpacity={0.85} onPress={() => Alert.alert('Coming soon', 'Google Sign In will be available at launch.')}>
                  <View style={styles.googleIcon}>
                    <Text style={styles.googleG}>G</Text>
                  </View>
                  <Text style={styles.socialBtnText}>Continue with Google</Text>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.emailBtn}
                  activeOpacity={0.85}
                  onPress={() => { setIsNewAccount(false); setShowEmailForm(true); }}
                >
                  <Text style={styles.emailBtnText}>Sign in with email</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { setIsNewAccount(true); setShowEmailForm(true); }}
                >
                  <Text style={styles.createAccountText}>Create a new account</Text>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>DEV</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity style={styles.demoBtn} activeOpacity={0.8} onPress={handleDemoSkip}>
                  <Ionicons name="flask-outline" size={18} color="#6B7280" />
                  <Text style={styles.demoBtnText}>Continue as Demo</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Email form */}
                <View style={styles.formHeader}>
                  <TouchableOpacity onPress={() => setShowEmailForm(false)} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={22} color="#374151" />
                  </TouchableOpacity>
                  <Text style={styles.formTitle}>{isNewAccount ? 'Create Account' : 'Sign In'}</Text>
                  <View style={{ width: 22 }} />
                </View>

                {isNewAccount && (
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Full name"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="words"
                    />
                  </View>
                )}

                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} activeOpacity={0.7}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color="#9CA3AF"
                    />
                  </TouchableOpacity>
                </View>

                {!isNewAccount && (
                  <TouchableOpacity activeOpacity={0.7} style={{ alignSelf: 'flex-end' }} onPress={() => { setForgotEmail(email); setShowForgot(true); setForgotSent(false); }}>
                    <Text style={styles.forgotText}>Forgot password?</Text>
                  </TouchableOpacity>
                )}

                {error && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.emailBtn, (!email || !password || loading) && styles.emailBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleEmailContinue}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.emailBtnText}>
                      {isNewAccount ? 'Create Account' : 'Sign In'}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setIsNewAccount((v) => !v)}
                >
                  <Text style={styles.createAccountText}>
                    {isNewAccount ? 'Already have an account? Sign in' : 'No account? Create one'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Security note */}
          <View style={styles.securityCard}>
            <View style={styles.securityIconCircle}>
              <Ionicons name="shield-checkmark" size={18} color="#F59E0B" />
            </View>
            <View style={styles.securityText}>
              <Text style={styles.securityLabel}>SECURE & PRIVATE</Text>
              <Text style={styles.securityBody}>
                Your travel data is protected. Location and photos are private by default — you choose what to share.
              </Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLinks}>
              <TouchableOpacity><Text style={styles.footerLink}>PRIVACY</Text></TouchableOpacity>
              <TouchableOpacity><Text style={styles.footerLink}>TERMS</Text></TouchableOpacity>
              <TouchableOpacity><Text style={styles.footerLink}>HELP</Text></TouchableOpacity>
            </View>
            <Text style={styles.footerCopy}>© 2026 Roamies</Text>
          </View>

        </SafeAreaView>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal visible={showForgot} animationType="slide" transparent presentationStyle="overFullScreen">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowForgot(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            {forgotSent ? (
              <>
                <View style={styles.forgotSuccessIcon}>
                  <Ionicons name="mail-open-outline" size={32} color="#6B3FA0" />
                </View>
                <Text style={styles.sheetTitle}>Check your email</Text>
                <Text style={styles.forgotSentText}>
                  We sent a reset link to{'\n'}<Text style={{ fontWeight: '700', color: '#111827' }}>{forgotEmail}</Text>
                </Text>
                <TouchableOpacity style={styles.forgotDoneBtn} onPress={() => setShowForgot(false)} activeOpacity={0.85}>
                  <Text style={styles.forgotDoneBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>Reset Password</Text>
                <Text style={styles.forgotSubtitle}>Enter your email and we'll send you a reset link.</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor="#9CA3AF"
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  style={[styles.emailBtn, (!forgotEmail.trim() || forgotLoading) && styles.emailBtnDisabled]}
                  onPress={handleForgotPassword}
                  activeOpacity={0.85}
                  disabled={forgotLoading}
                >
                  {forgotLoading
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.emailBtnText}>Send Reset Link</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#EDE9F8' },
  scrollContent: { flexGrow: 1 },
  container: { flex: 1 },

  // Top
  top: {
    backgroundColor: '#EDE9F8',
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 40,
    paddingHorizontal: 32,
    gap: 12,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6B3FA0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: '#6B3FA0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: { fontSize: 36, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  tagline: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24, letterSpacing: 0.2 },

  // Auth section
  authSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    gap: 12,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  socialBtnText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  googleIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', letterSpacing: 1 },

  // Email form
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  formTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  inputIcon: { flexShrink: 0 },
  input: { flex: 1, fontSize: 15, color: '#111827' },

  forgotText: { fontSize: 13, fontWeight: '600', color: '#6B3FA0' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },

  // Forgot password modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 44, gap: 14,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 4,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  forgotSubtitle: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginTop: -6 },
  forgotSuccessIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#EDE9F8', alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  forgotSentText: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  forgotDoneBtn: {
    backgroundColor: '#6B3FA0', borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#6B3FA0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  forgotDoneBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  emailBtn: {
    backgroundColor: '#6B3FA0',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#6B3FA0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  emailBtnDisabled: { backgroundColor: '#C4B5D4', shadowOpacity: 0 },
  emailBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  createAccountText: { fontSize: 15, fontWeight: '500', color: '#6B7280', textAlign: 'center', marginTop: 4 },

  demoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  demoBtnText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },

  // Security card
  securityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginHorizontal: 24,
    marginTop: 20,
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  securityIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  securityText: { flex: 1, gap: 4 },
  securityLabel: { fontSize: 11, fontWeight: '700', color: '#92400E', letterSpacing: 0.8 },
  securityBody: { fontSize: 13, color: '#78350F', lineHeight: 18 },

  // Footer
  footer: {
    backgroundColor: '#F5F3EE',
    paddingTop: 28,
    paddingBottom: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  footerLinks: { flexDirection: 'row', gap: 24 },
  footerLink: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.8 },
  footerCopy: { fontSize: 11, color: '#D1D5DB' },
});
