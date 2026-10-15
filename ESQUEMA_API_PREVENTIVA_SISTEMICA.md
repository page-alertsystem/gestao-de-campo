# Preventiva Sistêmica — campos para banco de dados e API

O GIO guarda o relatório como dados estruturados e imagens. O PDF não precisa ser persistido: ele é reconstruído no navegador no momento do download.

## 1. Tabela `system_preventives`

| Campo | Tipo PostgreSQL sugerido | Regra |
|---|---|---|
| `id` | `uuid` | Chave primária |
| `code` | `varchar(24)` | Único, exemplo `PREV26100001` |
| `created_at` | `timestamptz` | Momento real do envio |
| `created_by_id` | `uuid` | Usuário que enviou |
| `created_by_name` | `varchar(160)` | Nome preservado no momento do envio |
| `service_date` | `date` | Data informada da preventiva |
| `client` | `varchar(200)` | Cliente digitado |
| `asset_type` | `varchar(20)` | `Servidor`, `Workstation` ou `Storage` |
| `asset_name` | `varchar(200)` | Equipamento, nome ou hostname |
| `model` | `varchar(160)` | Opcional |
| `serial_number` | `varchar(160)` | Serial ou Service Tag, opcional |
| `ip_address` | `varchar(64)` | Opcional |
| `asset_function` | `text` | Função do equipamento |
| `workstation_user` | `varchar(160)` | Aplicável a workstation |
| `operating_system` | `varchar(200)` | Sistema e versão |
| `operating_system_build` | `varchar(100)` | Build do sistema |
| `cpu_usage_percent` | `numeric(5,2)` | Opcional, entre 0 e 100 |
| `memory_usage_percent` | `numeric(5,2)` | Opcional, entre 0 e 100 |
| `disk_usage_percent` | `numeric(5,2)` | Opcional, entre 0 e 100 |
| `usage_observation` | `text` | Observação sobre utilização |
| `digifort_version` | `varchar(100)` | Aplicável a servidor |
| `digifort_verification_date` | `date` | Aplicável a servidor |
| `offline_cameras` | `integer` | Aplicável a servidor |
| `digifort_observation` | `text` | Aplicável a servidor |
| `monitored_cameras` | `integer` | Aplicável a workstation |
| `operational_profile` | `varchar(120)` | Aplicável a workstation |
| `storage_capacity_tb` | `numeric(12,2)` | Aplicável a storage |
| `storage_used_tb` | `numeric(12,2)` | Aplicável a storage |
| `general_observation` | `text` | Conclusão técnica |

## 2. Tabela `system_preventive_capacity`

Relacionamento um para zero/ou um com `system_preventives`. Utilizada para servidores.

| Campo | Tipo PostgreSQL sugerido |
|---|---|
| `preventive_id` | `uuid` chave primária e estrangeira |
| `starter_tier` | `integer` |
| `total_cameras` | `integer` |
| `online_cameras` | `integer` |
| `other_devices` | `integer` |
| `retention_days` | `integer` |
| `average_bitrate_mbps` | `numeric(10,2)` |
| `resolution` | `varchar(80)` |
| `fps` | `integer` |
| `codec` | `varchar(40)` |
| `storage_total_tb` | `numeric(12,2)` |
| `storage_used_tb` | `numeric(12,2)` |
| `storage_free_tb` | `numeric(12,2)` |
| `disk_count` | `integer` |
| `raid_volume` | `varchar(160)` |

Os valores calculados, como consumo diário, storage necessário e retenção estimada, não precisam ser armazenados. Eles podem ser recalculados com os dados acima.

## 3. Tabela `system_preventive_checklist_answers`

Relacionamento de vários itens para uma preventiva.

| Campo | Tipo PostgreSQL sugerido |
|---|---|
| `id` | `uuid` chave primária |
| `preventive_id` | `uuid` chave estrangeira |
| `section` | `varchar(120)` |
| `item` | `text` |
| `status` | `varchar(20)` |
| `observation` | `text` |
| `display_order` | `integer` |

Valores aceitos em `status`: `Conforme`, `Não conforme` e `Não aplicável`.

## 4. Tabela `system_preventive_photos`

Relacionamento de várias fotos para uma preventiva.

| Campo | Tipo PostgreSQL sugerido | Observação |
|---|---|---|
| `id` | `uuid` | Chave primária |
| `preventive_id` | `uuid` | Chave estrangeira |
| `file_name` | `varchar(255)` | Nome original |
| `mime_type` | `varchar(80)` | Exemplo `image/jpeg` |
| `storage_key` | `varchar(500)` | Caminho ou identificador da imagem |
| `display_order` | `integer` | Ordem no PDF |
| `created_at` | `timestamptz` | Data de recebimento |

Recomendação: armazenar o arquivo em diretório controlado ou armazenamento de objetos e manter somente `storage_key` no PostgreSQL. Para os primeiros testes, a API pode receber a propriedade `data` em Base64 e convertê-la em arquivo antes de gravar a linha.

## JSON preparado pelo GIO

```json
{
  "preventive": {
    "id": "uuid",
    "code": "PREV26100001",
    "createdAt": "2026-10-08T12:00:00.000Z",
    "createdById": "uuid-do-usuario",
    "createdByName": "Nome do usuário",
    "serviceDate": "2026-10-08",
    "client": "Cliente",
    "assetType": "Servidor",
    "assetName": "SRV-CFTV-01",
    "model": "Dell R540",
    "serialNumber": "ABC123",
    "ipAddress": "192.168.0.10",
    "assetFunction": "Servidor de gravação"
  },
  "capacity": {
    "starterTier": 150,
    "totalCameras": 80,
    "onlineCameras": 78,
    "otherDevices": 2,
    "retentionDays": 31,
    "averageBitrateMbps": 2.5,
    "resolution": "1080p",
    "fps": 15,
    "codec": "H.265",
    "storageTotalTb": 80,
    "storageUsedTb": 50,
    "storageFreeTb": 30,
    "diskCount": 12,
    "raidVolume": "RAID 6"
  },
  "checklist": [
    {
      "id": "uuid",
      "section": "Hardware",
      "item": "Estado físico",
      "status": "Conforme",
      "observation": ""
    }
  ],
  "photos": [
    {
      "id": "uuid",
      "name": "evidencia-01.jpg",
      "data": "data:image/jpeg;base64,..."
    }
  ]
}
```

Quando o endereço e o contrato da API forem fornecidos, o GIO poderá enviar esse JSON no botão **Enviar preventiva** e consultar os registros em **Relatórios → Preventivas sistêmicas**.
