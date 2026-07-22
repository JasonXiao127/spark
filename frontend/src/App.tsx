import { useState, useEffect, useRef, FormEvent, useCallback } from 'react'
import axios, { AxiosError } from 'axios'

interface Device {
  id: number
  name: string
  mac_address: string
}

interface DeviceForm {
  name: string
  mac_address: string
}

interface ErrorResponse {
  detail?: string
}

const API_KEY_STORAGE_KEY = 'lantern-api-key'

function getStoredApiKey(): string {
  try {
    return window.sessionStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function App() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [message, setMessage] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>(getStoredApiKey)
  const [form, setForm] = useState<DeviceForm>({
    name: '',
    mac_address: '',
  })
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortController = useRef<AbortController | null>(null)

  // Cleanup timers and abort pending requests on unmount
  useEffect(() => {
    return () => {
      if (messageTimer.current) {
        clearTimeout(messageTimer.current)
      }
      if (abortController.current) {
        abortController.current.abort()
      }
    }
  }, [])

  const showMessage = useCallback((msg: string) => {
    if (messageTimer.current) {
      clearTimeout(messageTimer.current)
    }
    setMessage(msg)
    messageTimer.current = setTimeout(() => setMessage(''), 3000)
  }, [])

  const fetchDevices = useCallback(async () => {
    if (!apiKey) {
      setDevices([])
      setLoading(false)
      return
    }

    // Abort any in-flight request
    if (abortController.current) {
      abortController.current.abort()
    }
    const controller = new AbortController()
    abortController.current = controller

    setLoading(true)
    try {
      const res = await axios.get<Device[]>('/api/devices', {
        signal: controller.signal,
        headers: { 'X-API-Key': apiKey },
      })
      setDevices(res.data)
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.code === 'ERR_CANCELED') {
        return // Ignore aborted requests
      }
      showMessage('Failed to load devices')
    } finally {
      if (abortController.current === controller) {
        setLoading(false)
      }
    }
  }, [apiKey, showMessage])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const getErrorMessage = (err: unknown, fallback: string): string => {
    if (err instanceof AxiosError) {
      if (err.response?.status === 401) {
        return 'Invalid API key'
      }
      const data = err.response?.data as ErrorResponse | undefined
      return data?.detail ?? fallback
    }
    if (err instanceof Error) {
      return err.message
    }
    return fallback
  }

  const handleAddDevice = async (e: FormEvent) => {
    e.preventDefault()

    // Trim all inputs
    const trimmedForm: DeviceForm = {
      name: form.name.trim(),
      mac_address: form.mac_address.trim(),
    }

    if (!trimmedForm.name || !trimmedForm.mac_address) {
      showMessage('Name and MAC address are required')
      return
    }
    if (!apiKey) {
      showMessage('Enter the API key first')
      return
    }

    setSubmitting(true)
    try {
      await axios.post('/api/devices', trimmedForm, {
        headers: { 'X-API-Key': apiKey },
      })
      showMessage('Device added successfully')
      setForm({ name: '', mac_address: '' })
      await fetchDevices()
    } catch (err: unknown) {
      showMessage(getErrorMessage(err, 'Failed to add device'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleWake = async (device: Device) => {
    try {
      const res = await axios.post(`/api/wake/${device.id}`, undefined, {
        headers: { 'X-API-Key': apiKey },
      })
      showMessage(res.data.detail)
    } catch (err: unknown) {
      showMessage(getErrorMessage(err, 'Wake failed'))
    }
  }

  const handleDelete = async (device: Device) => {
    if (!window.confirm(`Delete "${device.name}"?`)) return
    try {
      await axios.delete(`/api/devices/${device.id}`, {
        headers: { 'X-API-Key': apiKey },
      })
      showMessage('Device deleted')
      await fetchDevices()
    } catch (err: unknown) {
      showMessage(getErrorMessage(err, 'Delete failed'))
    }
  }

  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>Lantern</h1>
        <p style={{ color: '#aaa' }}>Wake-on-LAN control panel</p>
      </header>

      <div style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="api-key" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
          API key
        </label>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          placeholder="Enter LANTERN_API_KEY"
          value={apiKey}
          onChange={(e) => {
            const nextKey = e.target.value
            setApiKey(nextKey)
            try {
              if (nextKey) {
                window.sessionStorage.setItem(API_KEY_STORAGE_KEY, nextKey)
              } else {
                window.sessionStorage.removeItem(API_KEY_STORAGE_KEY)
              }
            } catch {
              // Session storage can be unavailable in restrictive browser modes.
            }
          }}
          style={{ width: '100%' }}
        />
      </div>

      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            borderRadius: '6px',
            backgroundColor: '#263238',
            color: '#b0bec5',
            border: '1px solid #455a64',
          }}
        >
          {message}
        </div>
      )}

      <form
        onSubmit={handleAddDevice}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: '0.75rem',
          marginBottom: '2rem',
          alignItems: 'end',
        }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
            Name
          </label>
          <input
            placeholder="My PC"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
            MAC Address
          </label>
          <input
            placeholder="00:11:22:33:44:55"
            title="Format: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX"
            value={form.mac_address}
            onChange={(e) => setForm({ ...form, mac_address: e.target.value })}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '0.5rem 1.25rem',
            backgroundColor: submitting ? '#546e7a' : '#1e88e5',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            height: 'fit-content',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Adding...' : 'Add Device'}
        </button>
      </form>

      {loading ? (
        <p>Loading devices...</p>
      ) : devices.length === 0 ? (
        <p style={{ color: '#888' }}>No devices saved yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {devices.map((device) => (
            <div
              key={device.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#1e1e1e',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #333',
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ fontWeight: 600 }}>{device.name}</h3>
                <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                  MAC: {device.mac_address}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleWake(device)}
                  style={{
                    padding: '0.4rem 1rem',
                    backgroundColor: '#43a047',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                >
                  Wake
                </button>
                <button
                  onClick={() => handleDelete(device)}
                  style={{
                    padding: '0.4rem 1rem',
                    backgroundColor: 'transparent',
                    border: '1px solid #e53935',
                    color: '#e53935',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
