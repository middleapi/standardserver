import type { StandardLazyRequest, StandardLazyResponse, StandardRequest, StandardResponse } from '@standardserver/core'
import type { PeerCancelMessage, PeerEventStreamMessage, PeerOctetStreamMessage, PeerRequestMessage, PeerResponseMessage, PeerStreamCancelMessage } from '@standardserver/peer'
import type { Mock } from 'vitest'

export interface ClientServerTest {
  handler: Mock<(request: StandardLazyRequest) => Promise<StandardResponse>>
  request: Mock<(request: StandardRequest) => Promise<StandardLazyResponse>>

  /** Only available in peer adapter */
  sendClientPeerMessage?: Mock<(message: PeerRequestMessage | PeerCancelMessage | PeerEventStreamMessage | PeerOctetStreamMessage) => Promise<void>>
  sendServerPeerMessage?: Mock<(message: PeerResponseMessage | PeerCancelMessage | PeerEventStreamMessage | PeerOctetStreamMessage | PeerStreamCancelMessage) => Promise<void>>
}
