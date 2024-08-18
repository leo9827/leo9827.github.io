---
date: 2023-12-06T05:35:07+08:00
title: "Deadlock case of insert and update"
tags: ['mysql','database']
series: []
featured: false
---

I find a deadlock case of update ...

<!--more-->

场景：
事务1在批量 `insert` 时，事务2尝试锁定读取，此时事务1再锁定读取，事务2会得到输出 `Deadlock`
事务2 锁定读取的 `where` 条件和 事务1完全无关，且这条数据已经存在。

创建 table

```sql
create table tb  
(  
  _id  bigint auto_increment primary key,  
   id  varchar(32) not null,  
   pid varchar(32) not null default ''  
) engine innodb;  
insert into tb(id) values ('01'); # 提前插入一行数据
```

这里重点是：

1.`id` 列没有索引，整个表只有`primary key`

2.表中已经`insert` 过部分数据，事务2尝试锁定并修改这些已经 `insert` 的数据

3.事务1尝试 `insert` 新的数据，并尝试锁定新数据后修改

4.事务2要锁定数据的 `where` 条件和 事务1完全无关

修复方法：

1.在 `id` 这列新增一个索引 `alter table tb add index index(id);`，死锁则不存在。


复现路径

Session 1

```sql
start transaction;  
  
insert into tb(id)  
values ('11'),  
       ('12'),  
       ('13'),  
       ('14'),  
       ('15'),  
       ('16'),  
       ('17'),  
       ('18');  
  
select * from tb where id = '01' for update;  
update tb set pid = 'pid-01' where id = '01';  
  
commit;
```

Session 2

```sql
start transaction;  
  
select * from tb where id = '11' for update;  
update tb set pid = 'pid-11' where id = '11';  
  
commit ;
```

执行顺序：

1 Session 1 执行 `start` 和 `insert` 然后暂停

2 Session 2 执行 `start` 和 `select for update`

此时 Session2 出现阻塞：

`innoDB` 中的 `information_schema.innodb_lock` 会有如下记录:

| lock_id              | lock_trx_id | lock_mode | lock_type | lock_table | lock_index | lock_space | lock_page | lock_rec | lock_data |
| -------------------- | ----------- | --------- | --------- | ---------- | ---------- | ---------- | --------- | -------- | --------- |
| 31206760200:2515:3:2 | 31206760200 | X         | RECORD    | tb         | PRIMARY    | 2515       | 3         | 2        | 33        |
| 31206760140:2515:3:2 | 31206760140 | X         | RECORD    | tb         | PRIMARY    | 2515       | 3         | 2        | 33        |

此时再执行 Session 1 中的 `select for update` ，可以执行成功，

但同时 Session 2 会得到如下结果：

```txt
> select * from tb where id = '08:c0:eb:71:fb:81' for update  
[2023-12-14 18:00:50] 0 rows retrieved in 1 m 37 s 905 ms (execution: 1 m 37 s 897 ms, fetching: 8 ms)  
[2023-12-14 18:00:50] [40001][1213] Deadlock found when trying to get lock; try restarting transaction
```

说明 Session 1 的成功是在主动回滚 Session 2 产生的结果.

使用 `show engine innodb status` 查看 `monitor output`

```txt
------------------------  
LATEST DETECTED DEADLOCK  
------------------------  
2023-12-14 18:23:57 0x7f511d16d700  
*** (1) TRANSACTION:  
TRANSACTION 31206763612, ACTIVE 5 sec fetching rows  
mysql tables in use 1, locked 1  
LOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s)  
MySQL thread id 4152046, OS thread handle 139986358712064, query id 2055817203 10.226.143.197 root Sending data  
select * from tb where id = '71:c0:eb:08:fb:81' for update  
*** (1) WAITING FOR THIS LOCK TO BE GRANTED:  
RECORD LOCKS space id 2515 page no 3 n bits 144 index PRIMARY of table `cc`.`tb` trx id 31206763612 lock_mode X locks rec but not gap waiting  
Record lock, heap no 66 PHYSICAL RECORD: n_fields 5; compact format; info bits 0  
 0: len 8; hex 8000000000000041; asc        A;;  
 1: len 6; hex 000744116c54; asc   D lT;;  
 2: len 7; hex c2000005e70110; asc        ;;  
 3: len 17; hex 37323a63303a65623a30383a66623a3831; asc 72:c0:eb:08:fb:81;;  
 4: len 0; hex ; asc ;;  
  
*** (2) TRANSACTION:  
TRANSACTION 31206763604, ACTIVE 10 sec fetching rows, thread declared inside InnoDB 4952  
mysql tables in use 1, locked 1  
3 lock struct(s), heap size 1136, 3 row lock(s), undo log entries 8  
MySQL thread id 4151727, OS thread handle 139986357114624, query id 2055819469 10.226.143.197 root Sending data  
select * from tb where id = '72:c0:eb:08:fb:81' for update  
*** (2) HOLDS THE LOCK(S):  
RECORD LOCKS space id 2515 page no 3 n bits 144 index PRIMARY of table `cc`.`tb` trx id 31206763604 lock_mode X locks rec but not gap  
Record lock, heap no 50 PHYSICAL RECORD: n_fields 5; compact format; info bits 0  
 0: len 8; hex 8000000000000029; asc        );;  
 1: len 6; hex 0007441169d3; asc   D i ;;  
 2: len 7; hex 7d000002dd2a40; asc }    *@;;  
 3: len 17; hex 37323a63303a65623a30383a66623a3831; asc 72:c0:eb:08:fb:81;;  
 4: len 7; hex 7069642d313233; asc pid-123;;  
  
Record lock, heap no 66 PHYSICAL RECORD: n_fields 5; compact format; info bits 0  
 0: len 8; hex 8000000000000041; asc        A;;  
 1: len 6; hex 000744116c54; asc   D lT;;  
 2: len 7; hex c2000005e70110; asc        ;;  
 3: len 17; hex 37323a63303a65623a30383a66623a3831; asc 72:c0:eb:08:fb:81;;  
 4: len 0; hex ; asc ;;  
  
*** (2) WAITING FOR THIS LOCK TO BE GRANTED:  
RECORD LOCKS space id 2515 page no 3 n bits 144 index PRIMARY of table `cc`.`tb` trx id 31206763604 lock_mode X locks rec but not gap waiting  
Record lock, heap no 42 PHYSICAL RECORD: n_fields 5; compact format; info bits 0  
 0: len 8; hex 8000000000000031; asc        1;;  
 1: len 6; hex 000744116ac9; asc   D j ;;  
 2: len 7; hex db0001b5810110; asc        ;;  
 3: len 17; hex 37313a63303a65623a30383a66623a3831; asc 71:c0:eb:08:fb:81;;  
 4: len 0; hex ; asc ;;  
  
*** WE ROLL BACK TRANSACTION (1)
```

死锁前开启`deadlock log` 便于查看

```sql
set global innodb_print_all_deadlocks=1;
```

得到的 mysql deadlock log

```txt
2023-12-14T10:23:57.105902Z 4151727 [Note] InnoDB: Transactions deadlock detected, dumping detailed information.  
2023-12-14T10:23:57.105934Z 4151727 [Note] InnoDB:  
*** (1) TRANSACTION:  
TRANSACTION 31206763612, ACTIVE 5 sec fetching rows  
mysql tables in use 1, locked 1  
LOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s)  
MySQL thread id 4152046, OS thread handle 139986358712064, query id 2055817203 10.226.143.197 root Sending data  
select * from tb where id = '71:c0:eb:08:fb:81' for update  
2023-12-14T10:23:57.105987Z 4151727 [Note] InnoDB: *** (1) WAITING FOR THIS LOCK TO BE GRANTED:  
RECORD LOCKS space id 2515 page no 3 n bits 144 index PRIMARY of table `cc`.`tb` trx id 31206763612 lock_mode X locks rec but not gap waiting  
Record lock, heap no 66 PHYSICAL RECORD: n_fields 5; compact format; info bits 0  
0: len 8; hex 8000000000000041; asc        A;;  
1: len 6; hex 000744116c54; asc   D lT;;  
2: len 7; hex c2000005e70110; asc        ;;  
3: len 17; hex 37323a63303a65623a30383a66623a3831; asc 72:c0:eb:08:fb:81;;  
4: len 0; hex ; asc ;;  
2023-12-14T10:23:57.106234Z 4151727 [Note] InnoDB: *** (2) TRANSACTION:  
TRANSACTION 31206763604, ACTIVE 10 sec fetching rows, thread declared inside InnoDB 4952  
mysql tables in use 1, locked 1  
3 lock struct(s), heap size 1136, 3 row lock(s), undo log entries 8  
MySQL thread id 4151727, OS thread handle 139986357114624, query id 2055819469 10.226.143.197 root Sending data  
select * from tb where id = '72:c0:eb:08:fb:81' for update  
2023-12-14T10:23:57.106296Z 4151727 [Note] InnoDB: *** (2) HOLDS THE LOCK(S):  
RECORD LOCKS space id 2515 page no 3 n bits 144 index PRIMARY of table `cc`.`tb` trx id 31206763604 lock_mode X locks rec but not gap  
Record lock, heap no 50 PHYSICAL RECORD: n_fields 5; compact format; info bits 0  
0: len 8; hex 8000000000000029; asc        );;  
1: len 6; hex 0007441169d3; asc   D i ;;  
2: len 7; hex 7d000002dd2a40; asc }    *@;;  
3: len 17; hex 37323a63303a65623a30383a66623a3831; asc 72:c0:eb:08:fb:81;;  
4: len 7; hex 7069642d313233; asc pid-123;;  
Record lock, heap no 66 PHYSICAL RECORD: n_fields 5; compact format; info bits 0  
0: len 8; hex 8000000000000041; asc        A;;  
1: len 6; hex 000744116c54; asc   D lT;;  
2: len 7; hex c2000005e70110; asc        ;;  
3: len 17; hex 37323a63303a65623a30383a66623a3831; asc 72:c0:eb:08:fb:81;;  
4: len 0; hex ; asc ;;  
2023-12-14T10:23:57.106740Z 4151727 [Note] InnoDB: *** (2) WAITING FOR THIS LOCK TO BE GRANTED:  
RECORD LOCKS space id 2515 page no 3 n bits 144 index PRIMARY of table `cc`.`tb` trx id 31206763604 lock_mode X locks rec but not gap waiting  
Record lock, heap no 42 PHYSICAL RECORD: n_fields 5; compact format; info bits 0  
0: len 8; hex 8000000000000031; asc        1;;  
1: len 6; hex 000744116ac9; asc   D j ;;  
2: len 7; hex db0001b5810110; asc        ;;  
3: len 17; hex 37313a63303a65623a30383a66623a3831; asc 71:c0:eb:08:fb:81;;  
4: len 0; hex ; asc ;;  
2023-12-14T10:23:57.107014Z 4151727 [Note] InnoDB: *** WE ROLL BACK TRANSACTION (1)  
```

另一种情况:

Session 1 执行 

```sql
start transaction;  
select * from tb where id = '01' for update;
```

Session 2 执行 

```sql
start transaction;  
insert into tb(id)  
values ('11'),  
       ('12'),  
       ('13'),  
       ('14'),  
       ('15'),  
       ('16'),  
       ('17'),  
       ('18');  
  
select * from tb where id = '11' for update;
```

此时 Session 2 的 `select for update` 会被阻塞

Session 1 再执行 `update`

```sql
update tb set pid = 'pid-01' where id = '01';
```

此时， Session 1 执行结果是： `[1213] Deadlock found when trying to get lock; try restarting transaction`。

monitor output

```
------------------------
LATEST DETECTED DEADLOCK
------------------------
2023-12-15 09:50:10 0x7f511e2b1700
*** (1) TRANSACTION:
TRANSACTION 31206907203, ACTIVE 4 sec fetching rows
mysql tables in use 1, locked 1
LOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s), undo log entries 8
MySQL thread id 4203196, OS thread handle 139986374153984, query id 2076181314 10.226.143.197 root Sending data
select * from tb where id = '72:c0:eb:08:fb:81' for update
*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 2515 page no 3 n bits 176 index PRIMARY of table `cc`.`tb` trx id 31206907203 lock_mode X locks rec but not gap waiting
Record lock, heap no 42 PHYSICAL RECORD: n_fields 5; compact format; info bits 0
 0: len 8; hex 8000000000000031; asc        1;;
 1: len 6; hex 000744116ac9; asc   D j ;;
 2: len 7; hex db0001b5810110; asc        ;;
 3: len 17; hex 37313a63303a65623a30383a66623a3831; asc 71:c0:eb:08:fb:81;;
 4: len 0; hex ; asc ;;

*** (2) TRANSACTION:
TRANSACTION 31206907182, ACTIVE 12 sec fetching rows, thread declared inside InnoDB 4960
mysql tables in use 1, locked 1
3 lock struct(s), heap size 1136, 2 row lock(s)
MySQL thread id 4203200, OS thread handle 139986375218944, query id 2076184122 10.226.143.197 root updating
update tb set pid = 'pid-123' where id = '71:c0:eb:08:fb:81'
*** (2) HOLDS THE LOCK(S):
RECORD LOCKS space id 2515 page no 3 n bits 168 index PRIMARY of table `cc`.`tb` trx id 31206907182 lock_mode X locks rec but not gap
Record lock, heap no 42 PHYSICAL RECORD: n_fields 5; compact format; info bits 0
 0: len 8; hex 8000000000000031; asc        1;;
 1: len 6; hex 000744116ac9; asc   D j ;;
 2: len 7; hex db0001b5810110; asc        ;;
 3: len 17; hex 37313a63303a65623a30383a66623a3831; asc 71:c0:eb:08:fb:81;;
 4: len 0; hex ; asc ;;

*** (2) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 2515 page no 3 n bits 176 index PRIMARY of table `cc`.`tb` trx id 31206907182 lock_mode X locks rec but not gap waiting
Record lock, heap no 50 PHYSICAL RECORD: n_fields 5; compact format; info bits 0
 0: len 8; hex 8000000000000029; asc        );;
 1: len 6; hex 0007441169d3; asc   D i ;;
 2: len 7; hex 7d000002dd2a40; asc }    *@;;
 3: len 17; hex 37323a63303a65623a30383a66623a3831; asc 72:c0:eb:08:fb:81;;
 4: len 7; hex 7069642d313233; asc pid-123;;

*** WE ROLL BACK TRANSACTION (2)
```


排除是 `auto-increment` 相关的 `AUTO-INC` 表级锁问题

```sql
create table tb  
(  
    _id bigint primary key,  
    id  varchar(32) not null,  
    pid varchar(32) not null default ''  
) engine innodb;

start transaction;  
insert into tb(_id, id)  
values (1, '01'),  
       (2, '02'),  
       (3, '03'),  
       (4, '04'),  
       (5, '05'),  
       (6, '06'),  
       (7, '07'),  
       (8, '08');
```

TX1:

```sql
start transaction;  
select * from tb where id = '01' for update;  
```

TX2:

```sql
start transaction;  
insert into tb(_id, id)  
values (11, '11'),  
       (12, '12'),  
       (13, '13'),  
       (14, '14'),  
       (15, '15'),  
       (16, '16'),  
       (17, '17'),  
       (18, '18');  
  
select * from tb where id = '11' for update;
```

阻塞在 `select for update`

TX1: 

```sql
update tb set pid = 'pid-123' where id = '01';
# [40001][1213] Deadlock found when trying to get lock; try restarting transaction
```

得到同样的结果


锁范围确认
Tx1

```sql
start transaction;  
select * from tb where id = '04' for update;
```

Tx2:

```sql
start transaction;  
select * from tb where id = '01' for update; # 等待 _id = 4 Record X 锁 释放  
```

Tx3

```sql
start transaction;  
select * from tb where id = '05' for update; # 同样需要等待 _id = 4 Record X 锁 释放  
```

由此可见整个 table 都被 lock 住。

尝试复现

表锁. 
简化后的

```SQL
create table tb  
(  
    _id bigint primary key,  
    id  varchar(2) not null,  
    pid varchar(2) not null default ''  
) engine innodb;  
insert into tb(_id, id) values (1, '01');
```

TX1：

```sql
start transaction;  
select * from tb  for update;
```

TX2:

```sql
start transaction;  
insert into tb(_id, id)  
values (11, '11'),  
       (12, '12'),  
       (13, '13'),  
       (14, '14'),  
       (15, '15'),  
       (16, '16'),  
       (17, '17'),  
       (18, '18');  
  
select * from tb for update;
```

此时 `select for update` 阻塞住

Tx1:

```sql
# 第二次执行,  id 无论存在还是不存在都一样  
update tb set pid = '01' where id = '91';

# [40001][1213] Deadlock found when trying to get lock; try restarting transaction
```

同样发生 `Deadlock` 。

为什么在 tx1 获取到表锁后，tx2 进行 insert 再尝试获取表锁时，tx1 再进行 update 会触发 deadlock ?

> [!tip]
> 这里可以理解为什么回滚 tx1：因为 tx2 进行了 insert ，所以比较起来 tx2 比 tx1 大，InnoDB 优先回滚小事务。


| Tx1                                                        | Tx2                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `start transaction;`                                       |                                                              |
| `select * from tb for update;`                             |                                                              |
|                                                            | `start transaction;`                                         |
|                                                            | `insert into tb(_id, id) values (),(),(),();` --> hold primary index lock. |
| `update tb set pid = '123' where id = '01';`  --> Deadlock |                                                              |
|                                                            | `select * from tb for update;`                               |
|                                                            | `commit;`                                                    |
| `commit;`                                                  |                                                              |


如果 `update` 的语句有索引，比如是 `primary key`, 那么可以正常使用。
Tx1:

```sql
start transaction;  
select * from tb  for update;
```

Tx2:

```sql
start transaction;  
insert into tb(_id, id)  
values (11, '11'),  
       (12, '12'),  
       (13, '13'),  
       (14, '14'),  
       (15, '15'),  
       (16, '16'),  
       (17, '17'),  
       (18, '18');  
  
select * from tb for update;
```

阻塞在 `select for update`， 等待 Tx1 释放表锁。
Tx1: 

```sql
update tb set pid = 'pid-123' where _id = 4;
```

执行成功；这里 `_id` 是 `tb` 的 `primary key`。

此时 Tx2 获取到 表锁，可以继续往后执行


## 参考资料

MySQL 文档：
1[InnoDB中不同SQL语句设置的锁](https://dev.mysql.com/doc/refman/5.7/en/innodb-locks-set.html)
2 [InnoDB Transaction Model](https://dev.mysql.com/doc/refman/5.7/en/innodb-transaction-model.html)
3 [Deadlocks in InnoDB](https://dev.mysql.com/doc/refman/5.7/en/innodb-deadlocks.html)
4 [InnoDB Locking](https://dev.mysql.com/doc/refman/5.7/en/innodb-locking.html)

以下是关于不同SQL语句设置的锁的摘要内容：

If you have no indexes suitable for your statement and MySQL must scan the entire table to process the statement, every row of the table becomes locked, which in turn blocks all inserts by other users to the table. It is important to create good indexes so that your queries do not scan more rows than necessary. 

>如果您没有适合您的语句的索引，并且MySQL必须扫描整个表来处理该语句，则表的每一行都会被锁定，这反过来又会阻止其他用户对表的所有插入。创建良好的索引非常重要，这样您的查询就不会扫描超过必要的行数。

SELECT ... FOR UPDATE sets an exclusive next-key lock on every record the search encounters. However, only an index record lock is required for statements that lock rows using a unique index to search for a unique row. SELECT ... FOR UPDATE

>在搜索遇到的每条记录上设置一个独占的下一个键锁。但是，对于使用唯一索引锁定行以搜索唯一行的语句，只需要索引记录锁定。

INSERT sets an exclusive lock on the inserted row. This lock is an index-record lock, not a next-key lock (that is, there is no gap lock) and does not prevent other sessions from inserting into the gap before the inserted row. 

>INSERT 在插入的行上设置独占锁。此锁是索引记录锁，而不是下一个键锁（即，没有间隙锁），并且不会阻止其他会话插入插入行之前的间隙中。

Prior to inserting the row, a type of gap lock called an insert intention gap lock is set. This lock signals the intent to insert in such a way that multiple transactions inserting into the same index gap need not wait for each other if they are not inserting at the same position within the gap. Suppose that there are index records with values of 4 and 7. Separate transactions that attempt to insert values of 5 and 6 each lock the gap between 4 and 7 with insert intention locks prior to obtaining the exclusive lock on the inserted row, but do not block each other because the rows are nonconflicting. 

>在插入行之前，会设置一种称为插入意图间隙锁的间隙锁。此锁定表示插入意图，即插入到同一索引间隙中的多个事务如果未在间隙内的同一位置插入，则无需相互等待。假设存在值为 4 和 7 的索引记录。尝试插入值 5 和 6 的单独事务在获得插入行的独占锁之前，使用插入意图锁锁定 4 和 7 之间的间隙，但不会相互阻塞，因为行是不冲突的。

InnoDB sets an exclusive lock on the end of the index associated with the AUTO_INCREMENT column while initializing a previously specified AUTO_INCREMENT column on a table. 

>InnoDB 在与 AUTO_INCREMENT 列关联的索引末尾设置独占锁，同时初始化表上以前指定的 AUTO_INCREMENT 列。

With innodb_autoinc_lock_mode=0, InnoDB uses a special AUTO-INC table lock mode where the lock is obtained and held to the end of the current SQL statement (not to the end of the entire transaction) while accessing the auto-increment counter. Other clients cannot insert into the table while the AUTO-INC table lock is held. The same behavior occurs for “bulk inserts” with innodb_autoinc_lock_mode=1. Table-level AUTO-INC locks are not used with innodb_autoinc_lock_mode=2. For more information, See Section 14.6.1.6, “AUTO_INCREMENT Handling in InnoDB”. 

>InnoDB With innodb_autoinc_lock_mode=0 使用一种特殊的 AUTO-INC 表锁定模式，在访问自动递增计数器时，获取锁并将其保持到当前 SQL 语句的末尾（而不是整个事务的末尾）。当 AUTO-INC 保持表锁时，其他客户端无法插入到表中。对于带有 innodb_autoinc_lock_mode=1 的“批量插入”，也会发生相同的行为。表级 AUTO-INC 锁不与 innodb_autoinc_lock_mode=2 一起使用。有关更多信息，请参见第 14.6.1.6 节“InnoDB 中的AUTO_INCREMENT处理”。

InnoDB fetches the value of a previously initialized AUTO_INCREMENT column without setting any locks.

>InnoDB 在不设置任何锁的情况下获取以前初始化 AUTO_INCREMENT 的列的值。