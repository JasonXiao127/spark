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

type BusyAction = 'wake' | 'delete'

function App() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [submitting, setSubmitting] = useState<boolean>(false)
  // Per-device in-flight state so double clicks cannot fire extra wake
  // packets or duplicate deletes (each row is disabled while busy).
  const [busy, setBusy] = useState<{ id: number; action: BusyAction } | null>(null)
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
    setBusy({ id: device.id, action: 'wake' })
    try {
      const res = await axios.post(`/api/wake/${device.id}`, undefined, {
        headers: { 'X-API-Key': apiKey },
      })
      showMessage(res.data.detail)
    } catch (err: unknown) {
      showMessage(getErrorMessage(err, 'Wake failed'))
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (device: Device) => {
    if (!window.confirm(`Delete "${device.name}"?`)) return
    setBusy({ id: device.id, action: 'delete' })
    try {
      await axios.delete(`/api/devices/${device.id}`, {
        headers: { 'X-API-Key': apiKey },
      })
      showMessage('Device deleted')
      await fetchDevices()
    } catch (err: unknown) {
      showMessage(getErrorMessage(err, 'Delete failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <header className="app-header">
        <h1>Lantern</h1>
        <p>Wake-on-LAN control panel</p>
      </header>

      <div className="field">
        <label htmlFor="api-key">API key</label>
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
        />
      </div>

      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}

      <form className="form-grid" onSubmit={handleAddDevice}>
        <div>
          <label htmlFor="device-name">Name</label>
          <input
            id="device-name"
            placeholder="My PC"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="device-mac">MAC Address</label>
          <input
            id="device-mac"
            placeholder="00:11:22:33:44:55"
            title="Format: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX"
            value={form.mac_address}
            onChange={(e) => setForm({ ...form, mac_address: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-add" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add Device'}
        </button>
      </form>

      {loading ? (
        <p>Loading devices...</p>
      ) : devices.length === 0 ? (
        <p className="empty">No devices saved yet.</p>
      ) : (
        <div className="device-list">
          {devices.map((device) => (
            <div className="device-row" key={device.id}>
              <div className="info">
                <h3>{device.name}</h3>
                <div className="mac">MAC: {device.mac_address}</div>
              </div>
              <div className="actions">
                <button
                  className="btn btn-wake"
                  onClick={() => handleWake(device)}
                  disabled={busy !== null}
                >
                  {busy !== null && busy.id === device.id && busy.action === 'wake'
                    ? 'Waking...'
                    : 'Wake'}
                </button>
                <button
                  className="btn btn-delete"
                  onClick={() => handleDelete(device)}
                  disabled={busy !== null}
                >
                  {busy !== null && busy.id === device.id && busy.action === 'delete'
                    ? 'Deleting...'
                    : 'Delete'}
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