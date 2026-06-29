import { useState, useEffect, FormEvent } from 'react'
import axios from 'axios'

interface Device {
  id: number
  name: string
  mac_address: string
  ip_address: string
}

interface DeviceForm {
  name: string
  mac_address: string
  ip_address: string
}

function App() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [message, setMessage] = useState<string>('')
  const [form, setForm] = useState<DeviceForm>({
    name: '',
    mac_address: '',
    ip_address: '',
  })

  const fetchDevices = async () => {
    try {
      const res = await axios.get<Device[]>('/api/devices')
      setDevices(res.data)
    } catch (err) {
      showMessage('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  const showMessage = (msg: string) => { 
  setMessage(msg)
  setTimeout(() => setMessage(''), 3000)
}
  useEffect(() => {
    fetchDevices()
  }, [])

  const handleAddDevice = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.mac_address || !form.ip_address) {
      showMessage('All fields are required')
      return
    }
    try {
      await axios.post('/api/devices', form)
      showMessage('Device added successfully')
      setForm({ name: '', mac_address: '', ip_address: '' })
      fetchDevices()
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to add device'
      showMessage(detail)
    }
  }

  const handleWake = async (device: Device) => {
    try {
      const res = await axios.post(`/api/wake/${device.id}`)
      showMessage(res.data.detail)
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Wake failed'
      showMessage(detail)
    }
  }

  const handleDelete = async (device: Device) => {
    if (!window.confirm(`Delete "${device.name}"?`)) return
    try {
      await axios.delete(`/api/devices/${device.id}`)
      showMessage('Device deleted')
      fetchDevices()
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Delete failed'
      showMessage(detail)
    }
  }

  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>🔦 Lantern</h1>
        <p style={{ color: '#aaa' }}>Wake‑on‑LAN control panel</p>
      </header>

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
          gridTemplateColumns: '1fr 1fr 1fr auto',
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
            value={form.mac_address}
            onChange={(e) => setForm({ ...form, mac_address: e.target.value })}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
            IP Address
          </label>
          <input
            placeholder="192.168.1.100"
            value={form.ip_address}
            onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: '0.5rem 1.25rem',
            backgroundColor: '#1e88e5',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            height: 'fit-content',
          }}
        >
          Add Device
        </button>
      </form>

      {loading ? (
        <p>Loading devices…</p>
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
                  MAC: {device.mac_address} &nbsp;·&nbsp; IP: {device.ip_address}
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