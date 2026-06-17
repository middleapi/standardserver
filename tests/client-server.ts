import type { StandardLazyRequest, StandardLazyResponse, StandardRequest, StandardResponse } from '@standardserver/core'
import type { ClientPeerSendMessage, ServerPeerSendMessage } from '@standardserver/peer'
import type { Mock } from 'vitest'

export interface ClientServerTest {
  handler: Mock<(request: StandardLazyRequest) => Promise<StandardResponse>>
  request: Mock<(request: StandardRequest) => Promise<StandardLazyResponse>>

  /** Only available in peer adapter */
  sendClientPeerMessage?: Mock<(message: ClientPeerSendMessage) => Promise<void>>
  sendServerPeerMessage?: Mock<(message: ServerPeerSendMessage) => Promise<void>>
}
