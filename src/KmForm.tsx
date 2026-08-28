import { FormEvent, PointerEvent, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CarFront, ChevronRight, Gauge, MapPin, PenLine, Plus, Trash2, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import type { KmRecord, Vehicle } from './store'

const vehiclePhotos = [
  'Frente do veículo', 'Porta do motorista', 'Banco do motorista', 'Porta traseira — motorista',
  'Banco traseiro — motorista', 'Traseira do veículo', 'Porta-malas', 'Porta do passageiro',
  'Banco do passageiro', 'Porta traseira — passageiro', 'Banco traseiro — passageiro',
]

type Damage = { id: string; location: string; description: string }

export function KmForm({ vehicles, driver, onClose, onComplete }: { vehicles: Vehicle[]; driver: string; onClose: () => void; onComplete: (record: KmRecord) => void }) {
  const [vehicleId, setVehicleId] = useState('')
  const [km, setKm] = useState('')
  const [changeDriver, setChangeDriver] = useState(false)
  const [hasDamage, setHasDamage] = useState(false)
  const [destination, setDestination] = useState('')
  const [damages, setDamages] = useState<Damage[]>([{ id: crypto.randomUUID(), location: '', description: '' }])
  const [vehicleImages, setVehicleImages] = useState<Record<string, File>>({})
  const [damageImages, setDamageImages] = useState<Record<string, { first?: File; second?: File }>>({})
  const [signature, setSignature] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [location, setLocation] = useState<{ latitude?: number; longitude?: number; accuracy?: number; ready: boolean }>({ ready: false })
  const [error, setError] = useState('')
  const selectedVehicle = vehicles.find(vehicle => vehicle.id === vehicleId)
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(position => setLocation({ ready: true, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }), () => setLocation({ ready: false }), { enableHighAccuracy: true, timeout: 12000 })
  }, [])

  const addDamage = () => setDamages(current => [...current, { id: crypto.randomUUID(), location: '', description: '' }])
  const updateDamage = (id: string, field: 'location' | 'description', value: string) => setDamages(current => current.map(item => item.id === id ? { ...item, [field]: value } : item))
  const removeDamage = (id: string) => setDamages(current => current.length === 1 ? current : current.filter(item => item.id !== id))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const informed = Number(km)
    if (selectedVehicle && informed < selectedVehicle.mileage) {
      setError(`A quilometragem informada (${informed.toLocaleString('pt-BR')} km) é menor que a última registrada: ${selectedVehicle.mileage.toLocaleString('pt-BR')} km.`)
      return
    }
    if (changeDriver && !signature) {
      setError('A assinatura do condutor atual é obrigatória para a troca de condutor.')
      return
    }
    setError('')
    if (!location.ready) { setError('Ative a localização do celular para concluir o relatório.'); return }
    const record: KmRecord = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), vehicle: selectedVehicle?.plate ?? '', driver, mileage: informed, destination, changeDriver, hasDamage, damages: hasDamage ? damages.map(item => ({ location: item.location, description: item.description })) : [], latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy }
    if (changeDriver && selectedVehicle) {
      setGenerating(true)
      await createVehiclePdf({ record, vehicle: selectedVehicle, signature: signature!, vehicleImages, damageImages, damages })
      setGenerating(false)
    }
    onComplete(record)
  }

  return <div className="full-screen-layer km-layer">
    <form className="km-form" onSubmit={submit}>
      <header className="form-page-header"><div><p className="eyebrow">Operação com veículo</p><h2>Relatório de KM</h2><p>Preencha antes de ligar o veículo. A localização e o horário real serão registrados de forma protegida.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={21} /></button></header>
      <div className="form-progress"><span className="active">1</span><i /><span className={changeDriver ? 'active' : ''}>2</span><i /><span className={changeDriver ? 'active' : ''}>3</span><small>Informações</small><small>Condição do veículo</small><small>Assinatura</small></div>

      <main className="km-form-content">
        <section className="form-section">
          <div className="form-section-title"><span><CarFront size={20} /></span><div><h3>Informações da movimentação</h3><p>O condutor atual será identificado automaticamente pelo usuário conectado.</p></div></div>
          <div className="large-form-grid">
            <label>Veículo<select value={vehicleId} onChange={event => { setVehicleId(event.target.value); setKm(''); setError('') }} required><option value="">Selecione um veículo</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand} {vehicle.model} · {vehicle.plate}</option>)}</select></label>
            <label>Condutor atual<input value={driver} readOnly /></label>
            <label>Data<input type="date" value={today} min={today} max={today} readOnly /></label>
            <label>Horário informado<input type="time" defaultValue={now} required /></label>
            <label>Quilometragem atual<div className="km-input"><Gauge size={17} /><input type="number" min="0" step="1" value={km} onChange={event => { setKm(event.target.value); setError('') }} placeholder={selectedVehicle ? `Última: ${selectedVehicle.mileage.toLocaleString('pt-BR')} km` : 'Informe o KM'} required /></div></label>
            <label>Cliente (opcional)<select defaultValue=""><option value="">Sem cliente</option><option>Cliente Alpha</option><option>Hospital Central</option><option>Outros</option></select></label>
            <label className="wide">Destino<input value={destination} onChange={event => setDestination(event.target.value)} placeholder="Informe para onde está indo" required /></label>
            <label>Motivo<select defaultValue="Atendimento"><option>Atendimento</option><option>Implantação</option><option>Retirada de material</option><option>Devolução</option><option>Outro</option></select></label>
            <label className="full">Observação (opcional)<textarea placeholder="Inclua uma informação importante, se necessário." /></label>
          </div>
          {selectedVehicle && <div className="last-km"><Gauge size={17} /><span>Última quilometragem registrada para este veículo:</span><b>{selectedVehicle.mileage.toLocaleString('pt-BR')} km</b></div>}
          {error && <div className="form-error"><AlertTriangle size={18} />{error}</div>}
        </section>

        <section className="form-section toggle-section"><div><h3>Houve troca de condutor?</h3><p>Quando houver troca, será obrigatório registrar as condições e fotos do veículo.</p></div><div className="segmented"><button type="button" className={!changeDriver ? 'active' : ''} onClick={() => setChangeDriver(false)}>Não</button><button type="button" className={changeDriver ? 'active' : ''} onClick={() => setChangeDriver(true)}>Sim</button></div></section>

        {changeDriver && <>
          <section className="form-section">
            <div className="form-section-title"><span><Camera size={20} /></span><div><h3>Fotos obrigatórias do veículo</h3><p>As imagens devem ser feitas agora pela câmera do celular.</p></div></div>
            <div className="photo-grid">{vehiclePhotos.map((label, index) => <CameraField key={label} label={`${index + 1}. ${label}`} required onFile={file => setVehicleImages(current => ({ ...current, [label]: file }))} />)}</div>
          </section>

          <section className="form-section toggle-section"><div><h3>O veículo possui avarias?</h3><p>Se houver, registre cada local com uma descrição e duas fotos.</p></div><div className="segmented"><button type="button" className={!hasDamage ? 'active' : ''} onClick={() => setHasDamage(false)}>Não</button><button type="button" className={hasDamage ? 'active danger' : ''} onClick={() => setHasDamage(true)}>Sim</button></div></section>

          {hasDamage && <section className="form-section"><div className="form-section-title"><span className="danger-icon"><AlertTriangle size={20} /></span><div><h3>Avarias identificadas</h3><p>As avarias aparecerão antes das fotos gerais no PDF.</p></div></div><div className="damage-list">{damages.map((damage, index) => <article className="damage-card" key={damage.id}><div className="damage-heading"><b>Avaria {index + 1}</b><button type="button" onClick={() => removeDamage(damage.id)}><Trash2 size={16} /> Remover</button></div><div className="large-form-grid"><label>Local da avaria<input value={damage.location} onChange={event => updateDamage(damage.id, 'location', event.target.value)} placeholder="Ex.: Para-choque dianteiro" required /></label><label className="wide">Descrição<input value={damage.description} onChange={event => updateDamage(damage.id, 'description', event.target.value)} placeholder="Descreva o dano encontrado" required /></label></div><div className="photo-grid damage-photos"><CameraField label="Foto 1 da avaria" required onFile={file => setDamageImages(current => ({ ...current, [damage.id]: { ...current[damage.id], first: file } }))} /><CameraField label="Foto 2 da avaria" required onFile={file => setDamageImages(current => ({ ...current, [damage.id]: { ...current[damage.id], second: file } }))} /></div></article>)}</div><button type="button" className="secondary-button" onClick={addDamage}><Plus size={17} /> Adicionar outra avaria</button></section>}

          <section className="form-section">
            <div className="form-section-title"><span><PenLine size={20} /></span><div><h3>Assinatura do condutor atual</h3><p>Assine confirmando o recebimento e as condições registradas do veículo.</p></div></div>
            <SignaturePad onChange={setSignature} />
          </section>
        </>}
      </main>

      <footer className="form-page-footer"><p><MapPin size={17} />Localização, data, hora real e precisão do GPS serão registradas.</p><div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={generating}>{generating ? 'Gerando PDF...' : changeDriver ? 'Registrar e gerar PDF' : 'Registrar quilometragem'} {!generating && <ChevronRight size={18} />}</button></div></footer>
    </form>
  </div>
}

function CameraField({ label, required, onFile }: { label: string; required?: boolean; onFile: (file: File) => void }) {
  const [fileName, setFileName] = useState('')
  return <label className={fileName ? 'camera-field filled' : 'camera-field'}><input type="file" accept="image/*" capture="environment" required={required} onChange={event => { const file = event.target.files?.[0]; setFileName(file?.name ?? ''); if (file) onFile(file) }} /><Camera size={21} /><b>{fileName ? 'Foto registrada' : label}</b><small>{fileName || 'Abrir câmera'}</small></label>
}

function SignaturePad({ onChange }: { onChange: (signature: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) }
  }
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true
    const canvas = canvasRef.current!
    canvas.setPointerCapture(event.pointerId)
    const context = canvas.getContext('2d')!
    const current = point(event)
    context.beginPath()
    context.moveTo(current.x, current.y)
  }
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const context = canvasRef.current!.getContext('2d')!
    const current = point(event)
    context.lineWidth = 2.2
    context.lineCap = 'round'
    context.strokeStyle = '#17211b'
    context.lineTo(current.x, current.y)
    context.stroke()
  }
  const stop = () => { if (drawing.current) onChange(canvasRef.current!.toDataURL('image/png')); drawing.current = false }
  const clear = () => {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    onChange(null)
  }
  return <div className="signature-wrap"><canvas ref={canvasRef} width="900" height="230" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /><span>Assine com o dedo dentro da área</span><button type="button" onClick={clear}>Limpar assinatura</button></div>
}

async function createVehiclePdf({ record, vehicle, signature, vehicleImages, damageImages, damages }: { record: KmRecord; vehicle: Vehicle; signature: string; vehicleImages: Record<string, File>; damageImages: Record<string, { first?: File; second?: File }>; damages: Damage[] }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const code = `TROCA-${record.vehicle}-${new Date(record.createdAt).getTime()}`
  try {
    const logo = await fetch('/alert-logo.png').then(response => response.blob()).then(blobToDataUrl)
    pdf.addImage(logo, 'PNG', 15, 12, 48, 24)
  } catch { /* O título textual mantém o documento identificável. */ }
  pdf.setTextColor(48, 51, 54)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('Relatório de Troca de Condutor', 15, 46)
  pdf.setFontSize(9)
  pdf.setTextColor(112, 117, 122)
  pdf.text(`GIO — Gestão Integrada de Operações  |  ${code}`, 15, 53)
  pdf.setDrawColor(245, 130, 0)
  pdf.setLineWidth(1.2)
  pdf.line(15, 58, 195, 58)

  const info = [
    ['Veículo', `${vehicle.brand} ${vehicle.model}`], ['Placa', vehicle.plate],
    ['Quilometragem', `${record.mileage.toLocaleString('pt-BR')} km`], ['Condutor atual', record.driver],
    ['Data e hora real', new Date(record.createdAt).toLocaleString('pt-BR')], ['Destino', record.destination],
    ['Avarias', record.hasDamage ? 'Sim' : 'Não'], ['Precisão do GPS', `${Math.round(record.accuracy || 0)} metros`],
    ['Localização real', `${record.latitude?.toFixed(6)}, ${record.longitude?.toFixed(6)}`],
  ]
  let y = 70
  pdf.setFontSize(10)
  for (const [label, value] of info) {
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(70, 73, 76); pdf.text(`${label}:`, 15, y)
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(45, 48, 50); pdf.text(String(value), 55, y)
    y += 9
  }
  pdf.setFont('helvetica', 'bold'); pdf.text('Assinatura do condutor atual', 15, 170)
  pdf.addImage(signature, 'PNG', 15, 177, 90, 32)
  pdf.setDrawColor(120, 124, 126); pdf.line(15, 211, 108, 211)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(112, 117, 122)
  pdf.text('Documento gerado no celular. Fotos e arquivo não são armazenados pela GIO.', 15, 224)

  for (let index = 0; index < damages.length; index++) {
    const damage = damages[index]
    pdf.addPage()
    addPdfHeader(pdf, `Avaria ${index + 1} — ${damage.location}`)
    pdf.setFontSize(10); pdf.setTextColor(55, 58, 60); pdf.setFont('helvetica', 'normal')
    const lines = pdf.splitTextToSize(damage.description, 180)
    pdf.text(lines, 15, 40)
    const images = damageImages[damage.id]
    if (images?.first) pdf.addImage(await imageFileToJpeg(images.first), 'JPEG', 15, 62, 85, 75)
    if (images?.second) pdf.addImage(await imageFileToJpeg(images.second), 'JPEG', 110, 62, 85, 75)
    pdf.setFontSize(8); pdf.setTextColor(112, 117, 122)
    pdf.text('Foto 1', 15, 143); pdf.text('Foto 2', 110, 143)
  }

  for (let index = 0; index < vehiclePhotos.length; index++) {
    if (index % 2 === 0) { pdf.addPage(); addPdfHeader(pdf, 'Registro fotográfico do veículo') }
    const label = vehiclePhotos[index]
    const file = vehicleImages[label]
    const slot = index % 2
    const imageY = slot === 0 ? 42 : 160
    if (file) pdf.addImage(await imageFileToJpeg(file), 'JPEG', 35, imageY, 140, 92)
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(55, 58, 60)
    pdf.text(`${index + 1}. ${label}`, 35, imageY + 99)
  }

  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFontSize(8); pdf.setTextColor(135, 139, 142)
    pdf.text(`${code}  ·  Página ${page} de ${pages}`, 195, 289, { align: 'right' })
  }
  const safeDriver = record.driver.replace(/[^A-Za-zÀ-ÿ0-9]+/g, '-').replace(/^-|-$/g, '')
  const date = new Date(record.createdAt).toLocaleDateString('pt-BR').replaceAll('/', '-')
  pdf.save(`Relatório de troca de condutor - ${record.vehicle} - ${date} - ${safeDriver}.pdf`)
}

function addPdfHeader(pdf: jsPDF, title: string) {
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.setTextColor(48, 51, 54); pdf.text(title, 15, 22)
  pdf.setDrawColor(245, 130, 0); pdf.setLineWidth(1); pdf.line(15, 28, 195, 28)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob)
  })
}

async function imageFileToJpeg(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', .78)
}
