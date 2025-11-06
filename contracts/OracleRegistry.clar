(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-NAME u101)
(define-constant ERR-INVALID-PUBLIC-KEY u102)
(define-constant ERR-INSUFFICIENT-STAKE u103)
(define-constant ERR-ORACLE-ALREADY-EXISTS u104)
(define-constant ERR-ORACLE-NOT-FOUND u105)
(define-constant ERR-INVALID-STAKE-AMOUNT u106)
(define-constant ERR-MAX-ORACLES-EXCEEDED u107)
(define-constant ERR-SLASH-NOT-AUTHORIZED u108)
(define-constant ERR-ORACLE-NOT-ACTIVE u109)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u110)
(define-constant ERR-INVALID-STATUS u111)
(define-constant ERR-INVALID-TIMESTAMP u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-SLASH-AMOUNT-EXCEEDS-STAKE u114)

(define-data-var next-oracle-id uint u0)
(define-data-var max-oracles uint u500)
(define-data-var min-stake uint u10000)
(define-data-var registration-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map oracles
  uint
  {
    name: (string-utf8 50),
    owner: principal,
    public-key: (buff 33),
    stake: uint,
    status: bool,
    timestamp: uint,
    last-validation: uint
  }
)

(define-map oracles-by-name (string-utf8 50) uint)
(define-map oracle-updates
  uint
  {
    update-name: (optional (string-utf8 50)),
    update-public-key: (optional (buff 33)),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-oracle (id uint))
  (map-get? oracles id)
)

(define-read-only (get-oracle-updates (id uint))
  (map-get? oracle-updates id)
)

(define-read-only (is-oracle-registered (name (string-utf8 50)))
  (is-some (map-get? oracles-by-name name))
)

(define-read-only (get-oracle-count)
  (var-get next-oracle-id)
)

(define-private (validate-name (name (string-utf8 50)))
  (if (and (> (len name) u0) (<= (len name) u50))
      (ok true)
      (err ERR-INVALID-NAME))
)

(define-private (validate-public-key (pubkey (buff 33)))
  (if (is-eq (len pubkey) u33)
      (ok true)
      (err ERR-INVALID-PUBLIC-KEY))
)

(define-private (validate-stake-amount (amount uint))
  (if (>= amount (var-get min-stake))
      (ok true)
      (err ERR-INSUFFICIENT-STAKE))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-oracles (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-oracles new-max)
    (ok true)
  )
)

(define-public (set-min-stake (new-min uint))
  (begin
    (asserts! (> new-min u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set min-stake new-min)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-oracle
  (oracle-name (string-utf8 50))
  (oracle-public-key (buff 33))
  (stake-amount uint)
)
  (let (
        (next-id (var-get next-oracle-id))
        (current-max (var-get max-oracles))
        (authority (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-VERIFIED)))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ORACLES-EXCEEDED))
    (try! (validate-name oracle-name))
    (try! (validate-public-key oracle-public-key))
    (try! (validate-stake-amount stake-amount))
    (asserts! (is-none (map-get? oracles-by-name oracle-name)) (err ERR-ORACLE-ALREADY-EXISTS))
    (try! (stx-transfer? (var-get registration-fee) tx-sender authority))
    (map-set oracles next-id
      {
        name: oracle-name,
        owner: tx-sender,
        public-key: oracle-public-key,
        stake: stake-amount,
        status: true,
        timestamp: block-height,
        last-validation: block-height
      }
    )
    (map-set oracles-by-name oracle-name next-id)
    (var-set next-oracle-id (+ next-id u1))
    (print { event: "oracle-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (update-oracle
  (oracle-id uint)
  (update-name (optional (string-utf8 50)))
  (update-public-key (optional (buff 33)))
)
  (let ((oracle (unwrap! (map-get? oracles oracle-id) (err ERR-ORACLE-NOT-FOUND))))
    (asserts! (is-eq (get owner oracle) tx-sender) (err ERR-NOT-AUTHORIZED))
    (match update-name
      some-name (try! (validate-name some-name))
      true
    )
    (match update-public-key
      some-key (try! (validate-public-key some-key))
      true
    )
    (match update-name
      some-name
        (let ((existing (map-get? oracles-by-name some-name)))
          (match existing
            existing-id
              (asserts! (is-eq existing-id oracle-id) (err ERR-ORACLE-ALREADY-EXISTS))
            true
          )
        )
      true
    )
    (let ((old-name (get name oracle)))
      (match update-name
        some-name
          (if (is-eq old-name some-name)
              true
              (begin
                (map-delete oracles-by-name old-name)
                (map-set oracles-by-name some-name oracle-id)
              )
          )
        true
      )
    )
    (map-set oracles oracle-id
      {
        name: (match update-name some-name some-name (get name oracle)),
        owner: (get owner oracle),
        public-key: (match update-public-key some-key some-key (get public-key oracle)),
        stake: (get stake oracle),
        status: (get status oracle),
        timestamp: block-height,
        last-validation: (get last-validation oracle)
      }
    )
    (map-set oracle-updates oracle-id
      {
        update-name: update-name,
        update-public-key: update-public-key,
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (print { event: "oracle-updated", id: oracle-id })
    (ok true)
  )
)

(define-public (validate-oracle (oracle-id uint))
  (let ((oracle (unwrap! (map-get? oracles oracle-id) (err ERR-ORACLE-NOT-FOUND))))
    (asserts! (get status oracle) (err ERR-ORACLE-NOT-ACTIVE))
    (map-set oracles oracle-id
      (merge oracle { last-validation: block-height })
    )
    (ok true)
  )
)

(define-public (slash-oracle-stake (oracle-id uint) (slash-amount uint))
  (let (
        (oracle (unwrap! (map-get? oracles oracle-id) (err ERR-ORACLE-NOT-FOUND)))
        (authority (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-VERIFIED)))
      )
    (asserts! (get status oracle) (err ERR-ORACLE-NOT-ACTIVE))
    (asserts! (<= slash-amount (get stake oracle)) (err ERR-SLASH-AMOUNT-EXCEEDS-STAKE))
    (let ((new-stake (- (get stake oracle) slash-amount)))
      (map-set oracles oracle-id
        (merge oracle {
          stake: new-stake,
          status: (> new-stake u0)
        })
      )
      (print { event: "oracle-slashed", id: oracle-id, amount: slash-amount })
      (ok true)
    )
  )
)

(define-public (revoke-oracle (oracle-id uint))
  (let ((oracle (unwrap! (map-get? oracles oracle-id) (err ERR-ORACLE-NOT-FOUND))))
    (asserts! (is-eq (get owner oracle) tx-sender) (err ERR-NOT-AUTHORIZED))
    (map-set oracles oracle-id
      (merge oracle { status: false })
    )
    (print { event: "oracle-revoked", id: oracle-id })
    (ok true)
  )
)

(define-public (check-oracle-existence (name (string-utf8 50)))
  (ok (is-oracle-registered name))
)