-- ============================================================================
-- 高鐵訂票系統：3NF 修正版資料庫結構
-- 適用：MySQL 8.0.16 以上（需要可執行的 CHECK constraint）
-- 注意：Supabase 使用 PostgreSQL，請改執行 thsr_booking_supabase.sql。
--
-- 設計重點：
-- 1. BOOKING_ITEMS 不重複保存 schedule_id；班次可由起訖停靠點決定。
-- 2. 以 SCHEDULE_SEGMENTS 明確表示兩個相鄰停靠點之間的行車區間。
-- 3. SEAT_SEGMENT_RESERVATIONS 以「區間 + 座位」為主鍵，從資料庫層防止超賣。
-- 4. 票種與成交票價只保存在 BOOKING_ITEMS；TICKETS 不再重複保存。
-- 5. 訂單總額由明細加總的 VIEW 計算，避免 total_amount 更新異常。
-- ============================================================================

CREATE DATABASE IF NOT EXISTS thsr_booking
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE thsr_booking;

-- ----------------------------------------------------------------------------
-- 會員與乘客
-- ----------------------------------------------------------------------------

CREATE TABLE members (
    member_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '會員流水號',
    name           VARCHAR(100) NOT NULL COMMENT '會員姓名',
    email          VARCHAR(254) NOT NULL COMMENT '登入 Email',
    phone          VARCHAR(20) NULL COMMENT '聯絡電話',
    password_hash  VARCHAR(255) NOT NULL COMMENT '密碼雜湊；不可存明文密碼',
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
    PRIMARY KEY (member_id),
    CONSTRAINT uq_members_email UNIQUE (email),
    CONSTRAINT uq_members_phone UNIQUE (phone)
) ENGINE = InnoDB COMMENT = '會員';

CREATE TABLE passengers (
    passenger_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '乘客流水號',
    member_id       BIGINT UNSIGNED NOT NULL COMMENT '此乘客資料所屬會員',
    name            VARCHAR(100) NOT NULL COMMENT '乘客姓名',
    id_number       VARCHAR(32) NOT NULL COMMENT '證件號碼；正式系統應加密或代碼化',
    passenger_type  ENUM('ADULT', 'CHILD', 'SENIOR', 'DISABLED') NOT NULL
                    DEFAULT 'ADULT' COMMENT '乘客資格類型',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
    PRIMARY KEY (passenger_id),
    CONSTRAINT uq_passengers_member_document UNIQUE (member_id, id_number),
    CONSTRAINT fk_passengers_member
        FOREIGN KEY (member_id) REFERENCES members (member_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '會員保存的乘客資料';

-- ----------------------------------------------------------------------------
-- 列車、座位、車站與每日班次
-- ----------------------------------------------------------------------------

CREATE TABLE trains (
    train_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '列車／車次主檔流水號',
    train_number  VARCHAR(10) NOT NULL COMMENT '對外顯示車次號碼',
    train_type    VARCHAR(50) NOT NULL COMMENT '列車類型或車型',
    PRIMARY KEY (train_id),
    CONSTRAINT uq_trains_number UNIQUE (train_number)
) ENGINE = InnoDB COMMENT = '列車／車次主檔';

CREATE TABLE seats (
    seat_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '座位流水號',
    train_id         BIGINT UNSIGNED NOT NULL COMMENT '所屬列車',
    carriage_number  SMALLINT UNSIGNED NOT NULL COMMENT '車廂號碼',
    seat_number      VARCHAR(5) NOT NULL COMMENT '車廂內座號，例如 12A',
    seat_type        ENUM('STANDARD', 'BUSINESS', 'ACCESSIBLE') NOT NULL
                     DEFAULT 'STANDARD' COMMENT '座位類型',
    PRIMARY KEY (seat_id),
    CONSTRAINT uq_seats_train_position
        UNIQUE (train_id, carriage_number, seat_number),
    CONSTRAINT ck_seats_carriage_positive CHECK (carriage_number > 0),
    CONSTRAINT fk_seats_train
        FOREIGN KEY (train_id) REFERENCES trains (train_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '列車座位';

CREATE TABLE stations (
    station_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '車站流水號',
    station_code  VARCHAR(10) NOT NULL COMMENT '車站代碼',
    station_name  VARCHAR(100) NOT NULL COMMENT '車站名稱',
    city          VARCHAR(100) NOT NULL COMMENT '所在縣市',
    PRIMARY KEY (station_id),
    CONSTRAINT uq_stations_code UNIQUE (station_code)
) ENGINE = InnoDB COMMENT = '車站';

CREATE TABLE train_schedules (
    schedule_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '每日實際班次流水號',
    train_id     BIGINT UNSIGNED NOT NULL COMMENT '列車／車次主檔',
    service_date DATE NOT NULL COMMENT '行駛日期',
    status       ENUM('SCHEDULED', 'BOARDING', 'DEPARTED', 'ARRIVED', 'CANCELLED')
                 NOT NULL DEFAULT 'SCHEDULED' COMMENT '班次狀態',
    PRIMARY KEY (schedule_id),
    CONSTRAINT uq_train_schedules_train_date UNIQUE (train_id, service_date),
    CONSTRAINT fk_train_schedules_train
        FOREIGN KEY (train_id) REFERENCES trains (train_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '每日實際行駛班次';

CREATE TABLE train_stops (
    stop_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '班次停靠點流水號',
    schedule_id    BIGINT UNSIGNED NOT NULL COMMENT '所屬每日班次',
    station_id     BIGINT UNSIGNED NOT NULL COMMENT '停靠車站',
    stop_order     SMALLINT UNSIGNED NOT NULL COMMENT '停靠順序，從 1 開始',
    arrival_at     DATETIME NULL COMMENT '抵達日期時間；始發站可為 NULL',
    departure_at   DATETIME NULL COMMENT '出發日期時間；終點站可為 NULL',
    PRIMARY KEY (stop_id),
    CONSTRAINT uq_train_stops_schedule_order UNIQUE (schedule_id, stop_order),
    CONSTRAINT uq_train_stops_schedule_station UNIQUE (schedule_id, station_id),
    CONSTRAINT ck_train_stops_order_positive CHECK (stop_order > 0),
    CONSTRAINT ck_train_stops_time_order CHECK (
        arrival_at IS NULL OR departure_at IS NULL OR arrival_at <= departure_at
    ),
    CONSTRAINT fk_train_stops_schedule
        FOREIGN KEY (schedule_id) REFERENCES train_schedules (schedule_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_train_stops_station
        FOREIGN KEY (station_id) REFERENCES stations (station_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '某一每日班次的停靠站與時刻';

CREATE TABLE schedule_segments (
    segment_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '相鄰站間行車區間流水號',
    from_stop_id  BIGINT UNSIGNED NOT NULL COMMENT '區間起點停靠點',
    to_stop_id    BIGINT UNSIGNED NOT NULL COMMENT '區間終點停靠點',
    PRIMARY KEY (segment_id),
    -- 每一停靠點最多只會接出／接入一個相鄰區間，因此兩者都是候選鍵。
    CONSTRAINT uq_schedule_segments_from_stop UNIQUE (from_stop_id),
    CONSTRAINT uq_schedule_segments_to_stop UNIQUE (to_stop_id),
    CONSTRAINT ck_schedule_segments_distinct_stops CHECK (from_stop_id <> to_stop_id),
    CONSTRAINT fk_schedule_segments_from_stop
        FOREIGN KEY (from_stop_id) REFERENCES train_stops (stop_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_schedule_segments_to_stop
        FOREIGN KEY (to_stop_id) REFERENCES train_stops (stop_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '同一班次中兩個相鄰停靠點之間的區間';

-- ----------------------------------------------------------------------------
-- 訂單、訂票項目與座位區間鎖定
-- ----------------------------------------------------------------------------

CREATE TABLE bookings (
    booking_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '訂單流水號',
    member_id       BIGINT UNSIGNED NOT NULL COMMENT '下單會員',
    booking_number  VARCHAR(30) NOT NULL COMMENT '對外訂位代號',
    booking_status  ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED')
                    NOT NULL DEFAULT 'PENDING' COMMENT '訂單狀態',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
    PRIMARY KEY (booking_id),
    CONSTRAINT uq_bookings_number UNIQUE (booking_number),
    CONSTRAINT fk_bookings_member
        FOREIGN KEY (member_id) REFERENCES members (member_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '訂單主檔；總額由訂票項目加總取得';

CREATE TABLE booking_items (
    booking_item_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '訂票項目流水號',
    booking_id          BIGINT UNSIGNED NOT NULL COMMENT '所屬訂單',
    passenger_id        BIGINT UNSIGNED NOT NULL COMMENT '搭乘旅客',
    seat_id             BIGINT UNSIGNED NOT NULL COMMENT '全程使用座位',
    origin_stop_id      BIGINT UNSIGNED NOT NULL COMMENT '上車停靠點',
    destination_stop_id BIGINT UNSIGNED NOT NULL COMMENT '下車停靠點',
    fare_type           ENUM('FULL', 'CHILD', 'SENIOR', 'DISABLED', 'EARLY_BIRD')
                        NOT NULL DEFAULT 'FULL' COMMENT '成交票種',
    fare_amount         DECIMAL(10, 2) NOT NULL COMMENT '成交票價快照',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
    PRIMARY KEY (booking_item_id),
    -- 供座位區間表以複合外鍵驗證 booking_item_id 與 seat_id 的一致性。
    CONSTRAINT uq_booking_items_id_seat UNIQUE (booking_item_id, seat_id),
    CONSTRAINT ck_booking_items_distinct_stops CHECK (
        origin_stop_id <> destination_stop_id
    ),
    CONSTRAINT ck_booking_items_fare_nonnegative CHECK (fare_amount >= 0),
    CONSTRAINT fk_booking_items_booking
        FOREIGN KEY (booking_id) REFERENCES bookings (booking_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_booking_items_passenger
        FOREIGN KEY (passenger_id) REFERENCES passengers (passenger_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_booking_items_seat
        FOREIGN KEY (seat_id) REFERENCES seats (seat_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_booking_items_origin_stop
        FOREIGN KEY (origin_stop_id) REFERENCES train_stops (stop_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_booking_items_destination_stop
        FOREIGN KEY (destination_stop_id) REFERENCES train_stops (stop_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '一張訂單中的一位乘客、一段旅程及其成交票價';

CREATE TABLE seat_segment_reservations (
    segment_id      BIGINT UNSIGNED NOT NULL COMMENT '被占用的相鄰站間區間',
    seat_id         BIGINT UNSIGNED NOT NULL COMMENT '被占用的座位',
    booking_item_id BIGINT UNSIGNED NOT NULL COMMENT '占用此座位區間的訂票項目',
    reserved_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鎖位時間',
    -- 關鍵約束：同一區間的同一座位只能出現一次，直接阻止重複售票。
    PRIMARY KEY (segment_id, seat_id),
    CONSTRAINT uq_seat_segment_booking_item UNIQUE (booking_item_id, segment_id),
    CONSTRAINT fk_seat_segment_segment
        FOREIGN KEY (segment_id) REFERENCES schedule_segments (segment_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_seat_segment_booking_item_seat
        FOREIGN KEY (booking_item_id, seat_id)
        REFERENCES booking_items (booking_item_id, seat_id)
        ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE = InnoDB COMMENT = '座位在各相鄰站間區間的占用紀錄';

-- ----------------------------------------------------------------------------
-- 付款與票券
-- ----------------------------------------------------------------------------

CREATE TABLE payments (
    payment_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '付款流水號',
    booking_id     BIGINT UNSIGNED NOT NULL COMMENT '所屬訂單',
    amount         DECIMAL(10, 2) NOT NULL COMMENT '本次交易金額',
    payment_method ENUM('CREDIT_CARD', 'ATM', 'CONVENIENCE_STORE', 'MOBILE_PAYMENT')
                   NOT NULL COMMENT '付款方式',
    payment_status ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED')
                   NOT NULL DEFAULT 'PENDING' COMMENT '付款狀態',
    transaction_id VARCHAR(100) NULL COMMENT '金流平台交易編號',
    paid_at        DATETIME NULL COMMENT '付款完成時間',
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
    PRIMARY KEY (payment_id),
    CONSTRAINT uq_payments_transaction UNIQUE (transaction_id),
    CONSTRAINT ck_payments_amount_positive CHECK (amount > 0),
    CONSTRAINT ck_payments_paid_time CHECK (
        payment_status NOT IN ('PAID', 'REFUNDED') OR paid_at IS NOT NULL
    ),
    CONSTRAINT fk_payments_booking
        FOREIGN KEY (booking_id) REFERENCES bookings (booking_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '付款嘗試與結果；一張訂單可有多次付款紀錄';

CREATE TABLE tickets (
    ticket_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '票券流水號',
    booking_item_id BIGINT UNSIGNED NOT NULL COMMENT '一個訂票項目最多產生一張票',
    ticket_number   VARCHAR(40) NOT NULL COMMENT '對外票號',
    status          ENUM('ISSUED', 'USED', 'CANCELLED') NOT NULL
                    DEFAULT 'ISSUED' COMMENT '票券狀態',
    issued_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '開票時間',
    PRIMARY KEY (ticket_id),
    CONSTRAINT uq_tickets_booking_item UNIQUE (booking_item_id),
    CONSTRAINT uq_tickets_number UNIQUE (ticket_number),
    CONSTRAINT fk_tickets_booking_item
        FOREIGN KEY (booking_item_id) REFERENCES booking_items (booking_item_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '已開立票券；票種與成交價由訂票項目取得';

-- ----------------------------------------------------------------------------
-- 跨資料表商業規則
-- CHECK 與 FOREIGN KEY 無法檢查「同班次、前後順序、同列車」，故使用 trigger。
-- ----------------------------------------------------------------------------

DELIMITER $$

CREATE TRIGGER bi_schedule_segments_validate
BEFORE INSERT ON schedule_segments
FOR EACH ROW
BEGIN
    DECLARE v_from_schedule BIGINT UNSIGNED;
    DECLARE v_to_schedule   BIGINT UNSIGNED;
    DECLARE v_from_order    SMALLINT UNSIGNED;
    DECLARE v_to_order      SMALLINT UNSIGNED;

    SELECT schedule_id, stop_order
      INTO v_from_schedule, v_from_order
      FROM train_stops
     WHERE stop_id = NEW.from_stop_id;

    SELECT schedule_id, stop_order
      INTO v_to_schedule, v_to_order
      FROM train_stops
     WHERE stop_id = NEW.to_stop_id;

    IF v_from_schedule <> v_to_schedule THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '區間的起點與終點必須屬於同一班次';
    END IF;

    IF v_to_order <> v_from_order + 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '區間的終點必須是起點的下一個停靠站';
    END IF;
END$$

CREATE TRIGGER bu_schedule_segments_validate
BEFORE UPDATE ON schedule_segments
FOR EACH ROW
BEGIN
    -- 區間一旦被建立便視為班次結構，不允許改接其他停靠點。
    IF NEW.from_stop_id <> OLD.from_stop_id OR NEW.to_stop_id <> OLD.to_stop_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '不可修改既有區間端點；請刪除後重新建立';
    END IF;
END$$

CREATE TRIGGER bi_booking_items_validate
BEFORE INSERT ON booking_items
FOR EACH ROW
BEGIN
    DECLARE v_origin_schedule    BIGINT UNSIGNED;
    DECLARE v_destination_sched BIGINT UNSIGNED;
    DECLARE v_origin_order       SMALLINT UNSIGNED;
    DECLARE v_destination_order  SMALLINT UNSIGNED;
    DECLARE v_schedule_train     BIGINT UNSIGNED;
    DECLARE v_seat_train         BIGINT UNSIGNED;
    DECLARE v_booking_member     BIGINT UNSIGNED;
    DECLARE v_passenger_member   BIGINT UNSIGNED;
    DECLARE v_segment_count      INT UNSIGNED;

    SELECT schedule_id, stop_order
      INTO v_origin_schedule, v_origin_order
      FROM train_stops
     WHERE stop_id = NEW.origin_stop_id;

    SELECT schedule_id, stop_order
      INTO v_destination_sched, v_destination_order
      FROM train_stops
     WHERE stop_id = NEW.destination_stop_id;

    IF v_origin_schedule <> v_destination_sched THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '起站與迄站必須屬於同一班次';
    END IF;

    IF v_origin_order >= v_destination_order THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '起站順序必須早於迄站';
    END IF;

    SELECT train_id INTO v_schedule_train
      FROM train_schedules
     WHERE schedule_id = v_origin_schedule;

    SELECT train_id INTO v_seat_train
      FROM seats
     WHERE seat_id = NEW.seat_id;

    IF v_schedule_train <> v_seat_train THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '所選座位不屬於此班次的列車';
    END IF;

    SELECT member_id INTO v_booking_member
      FROM bookings
     WHERE booking_id = NEW.booking_id;

    SELECT member_id INTO v_passenger_member
      FROM passengers
     WHERE passenger_id = NEW.passenger_id;

    IF v_booking_member <> v_passenger_member THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '乘客資料不屬於下單會員';
    END IF;

    -- 旅程跨越 n 個停靠序差，就必須存在 n 個相鄰區間。
    SELECT COUNT(*) INTO v_segment_count
      FROM schedule_segments AS sg
      JOIN train_stops AS fs ON fs.stop_id = sg.from_stop_id
     WHERE fs.schedule_id = v_origin_schedule
       AND fs.stop_order >= v_origin_order
       AND fs.stop_order < v_destination_order;

    IF v_segment_count <> v_destination_order - v_origin_order THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '此班次的相鄰行車區間尚未完整建立';
    END IF;
END$$

CREATE TRIGGER bu_booking_items_immutable_trip
BEFORE UPDATE ON booking_items
FOR EACH ROW
BEGIN
    -- 已鎖位後若要改乘客、班次區間或座位，應刪除原項目再重新訂位，
    -- 讓 DELETE CASCADE 正確釋放舊的座位區間。
    IF NEW.booking_id <> OLD.booking_id
       OR NEW.passenger_id <> OLD.passenger_id
       OR NEW.seat_id <> OLD.seat_id
       OR NEW.origin_stop_id <> OLD.origin_stop_id
       OR NEW.destination_stop_id <> OLD.destination_stop_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '不可直接修改已鎖位項目的訂單、乘客、座位或行程';
    END IF;
END$$

CREATE TRIGGER ai_booking_items_reserve_segments
AFTER INSERT ON booking_items
FOR EACH ROW
BEGIN
    -- 將旅程涵蓋的每個相鄰區間鎖給同一座位。
    -- 若任何區間已有人占用，PRIMARY KEY (segment_id, seat_id) 會使整筆
    -- BOOKING_ITEMS INSERT 原子性失敗，因此不會留下部分鎖位資料。
    INSERT INTO seat_segment_reservations (segment_id, seat_id, booking_item_id)
    SELECT sg.segment_id, NEW.seat_id, NEW.booking_item_id
      FROM schedule_segments AS sg
      JOIN train_stops AS fs ON fs.stop_id = sg.from_stop_id
      JOIN train_stops AS os ON os.stop_id = NEW.origin_stop_id
      JOIN train_stops AS ds ON ds.stop_id = NEW.destination_stop_id
     WHERE fs.schedule_id = os.schedule_id
       AND fs.stop_order >= os.stop_order
       AND fs.stop_order < ds.stop_order;
END$$

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 衍生查詢：訂單總額不重複存入 BOOKINGS，而由明細即時計算。
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_booking_totals AS
SELECT
    b.booking_id,
    b.booking_number,
    COALESCE(SUM(bi.fare_amount), 0.00) AS total_amount
FROM bookings AS b
LEFT JOIN booking_items AS bi
       ON bi.booking_id = b.booking_id
GROUP BY b.booking_id, b.booking_number;
