import type { StandardLazyRequest, StandardLazyResponse, StandardRequest, StandardResponse } from '@standardserver/core'
import type { PeerAbortMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage } from '@standardserver/peer'
import type { Mock } from 'vitest'

export interface ClientServerTest {
  handler: Mock<(request: StandardLazyRequest) => Promise<StandardResponse>>
  request: Mock<(request: StandardRequest) => Promise<StandardLazyResponse>>

  /** Only available in peer adapter */
  sendClientPeerMessage?: Mock<(message: PeerRequestMessage | PeerAbortMessage | PeerEventStreamMessage | PeerOctetStreamMessage) => Promise<void>>
  sendServerPeerMessage?: Mock<(message: PeerResponseMessage | PeerAbortMessage | PeerEventStreamMessage | PeerOctetStreamMessage) => Promise<void>>
}
