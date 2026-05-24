'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';
const DRAFT_STORAGE_KEY = 'wa-config-draft';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const isDirtyRef = useRef(false);

  const markDirty = useCallback(() => {
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      setIsDirty(true);
    }
  }, []);

  const saveDraft = useCallback((next: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      const merged = { ...existing, ...next };
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Best-effort draft storage only.
    }
  }, []);

  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  }, []);

  const notifyConfigUpdated = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('wa-config-updated'));
  }, []);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      // Load form values from Supabase (shows what's in DB)
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      const shouldHydrate = !isDirtyRef.current;

      if (data) {
        setConfig(data);
        if (shouldHydrate) {
          setPhoneNumberId(data.phone_number_id || '');
          setWabaId(data.waba_id || '');
          setAccessToken(MASKED_TOKEN);
          setVerifyToken('');
          setTokenEdited(false);
        }
      } else {
        setConfig(null);
        if (shouldHydrate) {
          setPhoneNumberId('');
          setWabaId('');
          setAccessToken('');
          setVerifyToken('');
          setTokenEdited(false);
        }
      }

      // Then verify health via the API (decrypts token + pings Meta)
      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Failed to load WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setDraftReady(true);
      return;
    }

    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      setDraftReady(true);
      return;
    }

    try {
      const saved = JSON.parse(raw) as {
        phoneNumberId?: string;
        wabaId?: string;
        accessToken?: string;
        verifyToken?: string;
      };

      if (typeof saved.phoneNumberId === 'string') {
        setPhoneNumberId(saved.phoneNumberId);
      }
      if (typeof saved.wabaId === 'string') {
        setWabaId(saved.wabaId);
      }
      if (typeof saved.verifyToken === 'string') {
        setVerifyToken(saved.verifyToken);
      }
      if (typeof saved.accessToken === 'string' && saved.accessToken) {
        setAccessToken(saved.accessToken);
        setTokenEdited(true);
      }

      if (
        saved.phoneNumberId ||
        saved.wabaId ||
        saved.verifyToken ||
        saved.accessToken
      ) {
        isDirtyRef.current = true;
        setIsDirty(true);
      }
    } catch {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (authLoading) return;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    fetchConfig(user.id);
  }, [authLoading, user, fetchConfig, draftReady]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Access Token is required for initial setup');
      return;
    }

    try {
      setSaving(true);

      // Always POST through the API — it verifies with Meta and encrypts
      // the access_token server-side with ENCRYPTION_KEY. Skipping this
      // and writing direct to Supabase stores the token in plaintext,
      // which then fails decryption on every subsequent health check.
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        // Existing config — reuse stored encrypted token by decrypting on the
        // server. But our POST handler requires an access_token to verify
        // with Meta. If the user didn't change the token, we need to signal
        // that. Simplest: require token re-entry if they're updating.
        toast.error('Please re-enter the Access Token to save changes');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        setSaving(false);
        return;
      }

      toast.success(
        data.phone_info?.verified_name
          ? `Connected to ${data.phone_info.verified_name}`
          : 'Configuration saved successfully'
      );

      clearDraft();
      isDirtyRef.current = false;
      setIsDirty(false);

      if (user) await fetchConfig(user.id);
      notifyConfigUpdated();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          payload.phone_info?.verified_name
            ? `Connected to ${payload.phone_info.verified_name}`
            : 'API connection successful'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'API connection failed');
      }
      notifyConfigUpdated();
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed. Check network and try again.');
      notifyConfigUpdated();
    } finally {
      setTesting(false);
    }
  }

  async function handleReset() {
    if (!confirm('This will delete the current WhatsApp config so you can re-enter it. Continue?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to reset configuration');
        return;
      }

      toast.success('Configuration cleared. You can now re-enter your credentials.');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      clearDraft();
      isDirtyRef.current = false;
      setIsDirty(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
      notifyConfigUpdated();
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-accent" />
      </div>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] mt-4">
      {/* Main config form */}
      <div className="space-y-6">
        {/* Corrupted-token reset banner */}
        {showResetBanner && (
          <Alert className="bg-amber-950/40 border-amber-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-amber-200 mb-1">
                  Stored token can&apos;t be decrypted
                </AlertTitle>
                <AlertDescription className="text-amber-100/80 text-sm">
                  {statusMessage}
                </AlertDescription>
                <Button
                  onClick={handleReset}
                  disabled={resetting}
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-foreground"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      Reset Configuration
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Connection Status */}
        <Alert className="bg-surface border-border">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' ? (
              <CheckCircle2 className="size-4 text-accent" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <AlertTitle className="text-foreground mb-0">
              {connectionStatus === 'connected' ? 'Connected' : 'Not Connected'}
            </AlertTitle>
          </div>
          <AlertDescription className="text-muted">
            {connectionStatus === 'connected'
              ? 'Your WhatsApp Business API is connected and ready to send/receive messages.'
              : statusMessage ||
              'Configure your Meta API credentials below to connect your WhatsApp Business account.'}
          </AlertDescription>
        </Alert>

        {/* API Credentials */}
        <Card className="bg-surface border-border ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-foreground">API Credentials</CardTitle>
            <CardDescription className="text-muted">
              Enter your Meta WhatsApp Business API credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">Phone Number ID</Label>
              <Input
                placeholder="e.g. 100234567890123"
                value={phoneNumberId}
                onChange={(e) => {
                  const value = e.target.value;
                  setPhoneNumberId(value);
                  markDirty();
                  saveDraft({ phoneNumberId: value });
                }}
                className="bg-surface-light border-border text-foreground placeholder:text-muted"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">WhatsApp Business Account ID</Label>
              <Input
                placeholder="e.g. 100234567890456"
                value={wabaId}
                onChange={(e) => {
                  const value = e.target.value;
                  setWabaId(value);
                  markDirty();
                  saveDraft({ wabaId: value });
                }}
                className="bg-surface-light border-border text-foreground placeholder:text-muted"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Permanent Access Token</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Enter your access token"
                  value={accessToken}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAccessToken(value);
                    setTokenEdited(true);
                    markDirty();
                    saveDraft({ accessToken: value });
                  }}
                  onFocus={() => {
                    if (accessToken === MASKED_TOKEN) {
                      setAccessToken('');
                      setTokenEdited(true);
                      markDirty();
                      saveDraft({ accessToken: '' });
                    }
                  }}
                  className="bg-surface-light border-border text-foreground placeholder:text-muted pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {config && !tokenEdited && (
                <p className="text-xs text-muted">
                  Token is hidden for security. Re-enter it to update configuration.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Webhook Verify Token</Label>
              <Input
                placeholder="Create a custom verify token"
                value={verifyToken}
                onChange={(e) => {
                  const value = e.target.value;
                  setVerifyToken(value);
                  markDirty();
                  saveDraft({ verifyToken: value });
                }}
                className="bg-surface-light border-border text-foreground placeholder:text-muted"
              />
              <p className="text-xs text-muted">
                A custom string you create. Must match the token you set in Meta webhook settings.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card className="bg-surface border-border ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-foreground">Webhook Configuration</CardTitle>
            <CardDescription className="text-muted">
              Use this URL as your webhook callback in the Meta App Dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-foreground">Webhook Callback URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-surface-light border-border text-foreground font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyWebhookUrl}
                  className="shrink-0 border-border text-foreground hover:text-foreground hover:bg-surface-light"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-accent hover:bg-accent text-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !config}
            className="border-border text-foreground hover:text-foreground hover:bg-surface-light"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Zap className="size-4" />
                Test API Connection
              </>
            )}
          </Button>
          {config && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  Reset Configuration
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Setup Instructions Sidebar */}
      <div>
        <Card className="bg-surface border-border ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Setup Instructions</CardTitle>
            <CardDescription className="text-muted">
              Follow these steps to connect your WhatsApp Business API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              <AccordionItem className="border-border">
                <AccordionTrigger className="text-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-accent text-xs font-bold text-foreground">1</span>
                    Create a Meta App
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to <span className="text-accent">developers.facebook.com</span></li>
                    <li>Click &quot;My Apps&quot; and then &quot;Create App&quot;</li>
                    <li>Select &quot;Business&quot; as the app type</li>
                    <li>Fill in app details and create</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-accent text-xs font-bold text-foreground">2</span>
                    Add WhatsApp Product
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>In your app dashboard, click &quot;Add Product&quot;</li>
                    <li>Find &quot;WhatsApp&quot; and click &quot;Set Up&quot;</li>
                    <li>Follow the setup wizard to link your business</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-accent text-xs font-bold text-foreground">3</span>
                    Get API Credentials
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to WhatsApp &gt; API Setup</li>
                    <li>Copy your <strong className="text-foreground">Phone Number ID</strong></li>
                    <li>Copy your <strong className="text-foreground">WhatsApp Business Account ID</strong></li>
                    <li>Generate a <strong className="text-foreground">Permanent Access Token</strong> from Business Settings &gt; System Users</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-accent text-xs font-bold text-foreground">4</span>
                    Configure Webhooks
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to WhatsApp &gt; Configuration</li>
                    <li>Click &quot;Edit&quot; on the Webhook section</li>
                    <li>Paste the <strong className="text-foreground">Webhook Callback URL</strong> from above</li>
                    <li>Enter the same <strong className="text-foreground">Verify Token</strong> you set here</li>
                    <li>Subscribe to &quot;messages&quot; webhook field</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Meta WhatsApp API Documentation
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
