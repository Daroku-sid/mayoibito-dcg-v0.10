/* rules-gd1.js — マヨイビト v0.10 のルール処理 = gd1 v1.2（L01〜L13）＋ L14（v0.10 の裁定：効果の解決順）。v010/build-rules.js が作る（手で直さない） */
"use strict";
var GD1Rules = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/engine/effects-gd1.js
  var require_effects_gd1 = __commonJS({
    "src/engine/effects-gd1.js"(exports, module) {
      "use strict";
      function createEffects(E) {
        const { Game, CARD_MASTER, hasTrait, countTrait, isUnit, hasKeyword, nameOf, originalCost, otherSide, GD1Unsupported, MAX_YOUKAI, MAX_HUMANS } = E;
        const units = (p) => p.humans.concat(p.youkai);
        function onceTurn(ctx, name) {
          const k = Game.turnUseKey(ctx.side, name);
          if (Game.isEffectUsed(k)) return false;
          Game.markEffectUsed(k);
          return true;
        }
        function onceGame(ctx, name) {
          const k = Game.gameUseKey(ctx.side, name);
          if (Game.isEffectUsed(k)) return false;
          Game.markEffectUsed(k);
          return true;
        }
        function pickOppTarget(ctx, cands, title, message, done, cb) {
          const list = ctx.targetable(cands);
          if (!list.length) {
            ctx.log("不発：対象がいません（" + title + "）");
            done();
            return;
          }
          ctx.pickBoardTarget({ title, message, candidates: list }, (t) => {
            if (!t) {
              done();
              return;
            }
            cb(t);
          });
        }
        function pickOwnTarget(ctx, cands, title, message, done, cb) {
          if (!cands.length) {
            ctx.log("不発：対象がいません（" + title + "）");
            done();
            return;
          }
          ctx.pickBoardTarget({ title, message, candidates: cands.slice() }, (t) => {
            if (!t) {
              done();
              return;
            }
            cb(t);
          });
        }
        function dmg(ctx, target, n, name) {
          let amount = n;
          if (ctx.source.master.type === "human") (ctx.source.equipment || []).forEach((g) => {
            if (hasKeyword(g, "効果によって与えるダメージを+1する")) amount += 1;
          });
          Game.dealEffectDamage(target, amount, name || nameOf(ctx.source), ctx.side);
        }
        function lookTake(ctx, n, filterFn, opts, done) {
          const o = Object.assign({ count: 1, reveal: false, bottom: "choose", exact: false }, opts || {});
          const looked = Game.lookTopOfDeck(ctx.side, n);
          ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
          if (!looked.length) {
            done();
            return;
          }
          const cands = looked.filter(filterFn);
          const finish = (taken) => {
            Game.resolveLook(ctx.side, looked, taken, o.reveal, o.bottom);
            ctx.showCards(taken, done);
          };
          if (!cands.length) {
            finish([]);
            return;
          }
          ctx.pickCards({ title: nameOf(ctx.source), message: "手札に加えるカードを選んでください", cards: looked, selectable: cands, count: o.count, mode: o.exact ? "exact" : "max" }, (chosen) => finish(chosen || []));
        }
        function takeFromTrash(ctx, filterFn, title, done) {
          const cands = ctx.me.trash.filter(filterFn);
          if (!cands.length) {
            ctx.log("不発：回収できるカードがありません");
            done();
            return;
          }
          ctx.pickCards({ title, message: "手札へ加えるカードを選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (chosen) => {
            if (chosen && chosen.length) {
              Game.moveTrashToHand(ctx.side, chosen[0]);
              ctx.showCards(chosen, done);
              return;
            }
            ctx.log("回収：0枚を選択");
            done();
          });
        }
        function drawN(ctx, n) {
          let drew = 0;
          for (let i = 0; i < n; i++) {
            if (ctx.isOver()) break;
            if (Game.drawOne(ctx.side)) drew++;
          }
          return drew;
        }
        function discardOwnChoice(ctx, n, done, cause) {
          const hand = ctx.me.hand.slice();
          if (!hand.length) {
            ctx.log("手札がないため捨てません");
            done([]);
            return;
          }
          const k = Math.min(n, hand.length);
          ctx.pickCards({ title: nameOf(ctx.source), message: "トラッシュへ置く手札を" + k + "枚選んでください", cards: hand, count: k, mode: "exact", ordered: true }, (chosen) => {
            done(Game.discardFromHand(ctx.side, chosen, cause));
          });
        }
        function opponentDiscards(ctx, n, done, cause) {
          const opp = otherSide(ctx.side);
          const hand = ctx.opponent.hand.slice();
          if (!hand.length) {
            ctx.log("相手の手札がないため捨てません");
            done([]);
            return;
          }
          const k = Math.min(n, hand.length);
          const ops = ctx.oppOps();
          ops.pickCards({ title: nameOf(ctx.source) + "（相手の効果）", message: "トラッシュへ置く手札を" + k + "枚選んでください", cards: hand, count: k, mode: "exact" }, (chosen) => {
            done(Game.discardFromHand(opp, chosen, cause || nameOf(ctx.source)));
          });
        }
        function lookerDiscards(ctx, n, done) {
          const opp = otherSide(ctx.side);
          const hand = ctx.opponent.hand.slice();
          Game.recordHandLook(ctx.side, hand);
          ctx.log("手札を見た：" + ctx.me.label + " → " + ctx.opponent.label + "の手札" + hand.length + "枚（見た側だけが知る）");
          if (!hand.length) {
            done([]);
            return;
          }
          const k = Math.min(n, hand.length);
          ctx.pickCards({ title: nameOf(ctx.source), message: "相手の手札から捨てるカードを" + k + "枚選んでください", cards: hand, count: k, mode: "exact", privateView: true }, (chosen) => {
            done(Game.discardFromHand(opp, chosen, nameOf(ctx.source)));
          });
        }
        function forcedOppPlay(ctx, pay, done) {
          const opp = otherSide(ctx.side);
          const P = ctx.opponent;
          if (P.humans.length >= MAX_HUMANS) {
            ctx.log("不発：相手の人間エリアが上限");
            done();
            return;
          }
          const cands = P.hand.filter((c) => c.master.type === "human" && (c.faces ? CARD_MASTER[c.faces[0]] : c.master).type === "human").filter((c) => {
            const r = Game.canPlay(opp, c, { free: !pay });
            return r.ok;
          });
          if (!cands.length) {
            ctx.log("不発：相手が出せる人間がありません");
            done();
            return;
          }
          ctx.oppOps().pickCards({ title: nameOf(ctx.source) + "（強制登場）", message: pay ? "場に出す人間を1枚選んでください（そのコストを支払う）" : "場に出す人間を1枚選んでください（コストなし）", cards: cands, count: 1, mode: "exact" }, (chosen) => {
            const c = chosen && chosen[0];
            if (!c) {
              done();
              return;
            }
            const r = Game.playUnit(opp, c, { free: !pay, byEffect: true, controller: ctx.side });
            if (!r.ok) ctx.log("不発：" + r.reasons.join("／"));
            done();
          });
        }
        function useEventFromTrash(ctx, ev, after, ignoreOnce, done) {
          Game._useEvent(ctx.side, ev, { from: "trash", cost: 0, after, ignoreOnce });
          done();
        }
        function pump(ctx, target, speed, hp, until, note) {
          Game.addTempEffect({ kind: "stat", owner: ctx.side, target: { uid: target.uid }, speed, hp, until, note: note || nameOf(ctx.source) });
          ctx.log(note || nameOf(ctx.source) + "：" + nameOf(target) + " スピード" + (speed >= 0 ? "+" : "") + speed + (hp ? " 体力" + (hp >= 0 ? "+" : "") + hp : ""));
        }
        function speedDebuffNextAssault(ctx, title, n, done) {
          pickOppTarget(ctx, ctx.opponent.youkai, title, "スピード-" + n + "する怪異", done, (t) => {
            pump(ctx, t, -n, 0, { type: "oppAssault" }, title + "：" + nameOf(t) + " スピード-" + n + "（次の相手の襲撃時まで）");
            done();
          });
        }
        const ownAssaultUntil = (ctx) => ({ type: "ownAssault" });
        const nextTurnStartUntil = () => ({ type: "myNextTurnStart" });
        const NOISE_TABLE = {
          A: [
            { key: "A1", label: "自分は物音を1得る", run: (ctx, done) => {
              Game.gainNoise(ctx.side, 1, "物音効果");
              done();
            } },
            { key: "A2", label: "自分のデッキの上から1枚を見て、上か下に戻す", run: (ctx, done) => topOrBottom(ctx, done) },
            { key: "A3", label: "相手は自分の手札1枚を捨てる", avail: (ctx) => ctx.opponent.hand.length > 0, run: (ctx, done) => opponentDiscards(ctx, 1, () => done()) },
            { key: "A4", label: "次の自分の襲撃時、自分の怪異1枚のスピードを+1する", avail: (ctx) => ctx.me.youkai.length > 0, run: (ctx, done) => pickOwnTarget(ctx, ctx.me.youkai, "物音", "スピード+1する怪異", done, (t) => {
              pump(ctx, t, 1, 0, ownAssaultUntil(ctx), "物音");
              done();
            }) },
            { key: "A5", label: "自分の怪異1枚が受けているダメージを1取り除く", avail: (ctx) => ctx.me.youkai.some((c) => c.accumulatedDamage > 0), run: (ctx, done) => pickOwnTarget(ctx, ctx.me.youkai.filter((c) => c.accumulatedDamage > 0), "物音", "ダメージを1取り除く怪異", done, (t) => {
              Game.healDamage(t, 1);
              done();
            }) }
          ],
          B: [
            { key: "B1", label: "相手の怪異1枚に1ダメージを与える", avail: (ctx) => ctx.targetable(ctx.opponent.youkai).length > 0, run: (ctx, done) => pickOppTarget(ctx, ctx.opponent.youkai, "物音", "1ダメージを与える怪異", done, (t) => {
              dmg(ctx, t, 1, "物音");
              done();
            }) },
            { key: "B2", label: "自分は1枚ドローする", run: (ctx, done) => {
              drawN(ctx, 1);
              done();
            } },
            { key: "B3", label: "相手の手札からランダムに1枚を捨てる", avail: (ctx) => ctx.opponent.hand.length > 0, run: (ctx, done) => {
              Game.discardRandomFromHand(otherSide(ctx.side), 1, "物音");
              done();
            } },
            { key: "B4", label: "次の自分の襲撃時、自分の怪異1枚のスピードを+2する", avail: (ctx) => ctx.me.youkai.length > 0, run: (ctx, done) => pickOwnTarget(ctx, ctx.me.youkai, "物音", "スピード+2する怪異", done, (t) => {
              pump(ctx, t, 2, 0, ownAssaultUntil(ctx), "物音");
              done();
            }) },
            { key: "B5", label: "自分の怪異1枚が受けているダメージを2取り除く", avail: (ctx) => ctx.me.youkai.some((c) => c.accumulatedDamage > 0), run: (ctx, done) => pickOwnTarget(ctx, ctx.me.youkai.filter((c) => c.accumulatedDamage > 0), "物音", "ダメージを2取り除く怪異", done, (t) => {
              Game.healDamage(t, 2);
              done();
            }) },
            { key: "B6", label: "自分は物音を2得る", run: (ctx, done) => {
              Game.gainNoise(ctx.side, 2, "物音効果");
              done();
            } }
          ],
          C: [
            { key: "C1", label: "相手の怪異1枚に2ダメージを与える", avail: (ctx) => ctx.targetable(ctx.opponent.youkai).length > 0, run: (ctx, done) => pickOppTarget(ctx, ctx.opponent.youkai, "物音", "2ダメージを与える怪異", done, (t) => {
              dmg(ctx, t, 2, "物音");
              done();
            }) },
            { key: "C2", label: "自分は自分の手札1枚を捨てる。その後、2枚ドローする", run: (ctx, done) => discardOwnChoice(ctx, 1, () => {
              drawN(ctx, 2);
              done();
            }, "物音") },
            { key: "C3", label: "相手の場に人間が2枚以上あるなら、相手の人間1枚に2ダメージを与える", avail: (ctx) => ctx.opponent.humans.length >= 2 && ctx.targetable(ctx.opponent.humans).length > 0, run: (ctx, done) => pickOppTarget(ctx, ctx.opponent.humans, "物音", "2ダメージを与える人間", done, (t) => {
              dmg(ctx, t, 2, "物音");
              done();
            }) },
            { key: "C4", label: "相手の手札を見て、その中から1枚を捨てる", avail: (ctx) => ctx.opponent.hand.length > 0, run: (ctx, done) => lookerDiscards(ctx, 1, () => done()) },
            { key: "C5", label: "次の自分の襲撃時、自分の人間/怪異1枚のスピードを+2する", avail: (ctx) => units(ctx.me).length > 0, run: (ctx, done) => pickOwnTarget(ctx, units(ctx.me), "物音", "スピード+2するカード", done, (t) => {
              pump(ctx, t, 2, 0, ownAssaultUntil(ctx), "物音");
              done();
            }) },
            { key: "C6", label: "次の相手のターン終了時まで、相手の人間/怪異1枚のスピードを-2する", avail: (ctx) => ctx.targetable(units(ctx.opponent)).length > 0, run: (ctx, done) => pickOppTarget(ctx, units(ctx.opponent), "物音", "スピード-2するカード", done, (t) => {
              pump(ctx, t, -2, 0, { type: "oppNextTurnEnd", setTurn: ctx.state.turnCount }, "物音");
              done();
            }) },
            { key: "C7", label: "何も起こらない", run: (ctx, done) => {
              ctx.log("物音：何も起こらない");
              done();
            } }
          ]
        };
        function topOrBottom(ctx, done) {
          const p = ctx.me;
          if (!p.deck.length) {
            done();
            return;
          }
          const c = p.deck[0];
          ctx.log("山札の上を見た：" + p.label);
          ctx.pickOption({ title: nameOf(ctx.source), message: "山札の上のカードを上に戻すか、下に置くか", cards: [c], options: [{ key: "top", label: "上に戻す" }, { key: "bottom", label: "下に置く" }] }, (o) => {
            if (o && o.key === "bottom") {
              p.deck.shift();
              p.deck.push(c);
              ctx.log("山札の下へ：1枚");
            } else ctx.log("山札の上に戻した");
            done();
          });
        }
        const D = {};
        D["MURA-003"] = { enter(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 2);
          done();
        } };
        D["MURA-004"] = { enter(ctx, done) {
          const hand = ctx.me.hand.slice();
          if (!hand.length) {
            ctx.log("不発：手札がない");
            done();
            return;
          }
          const k = Math.min(2, hand.length);
          ctx.pickCards({ title: nameOf(ctx.source), message: "トラッシュへ置く手札を選んでください（0〜" + k + "枚）。その枚数だけドローします", cards: hand, count: k, mode: "max" }, (chosen) => {
            const c = (chosen || []).length;
            if (!c) {
              ctx.log("カエデ：0枚を選択");
              done();
              return;
            }
            Game.discardFromHand(ctx.side, chosen, "カエデ");
            if (ctx.isOver()) {
              done();
              return;
            }
            drawN(ctx, c);
            done();
          });
        } };
        D["MURA-005"] = { enter(ctx, done) {
          if (Game.isEffectUsed(Game.turnUseKey(ctx.side, "MURA-005"))) {
            ctx.log("不発：【ターンに1回】使用済み");
            done();
            return;
          }
          if (countTrait(ctx.me.trash, "村") < 10) {
            ctx.log("不発：トラッシュの〔村〕が10枚未満");
            done();
            return;
          }
          pickOppTarget(ctx, ctx.opponent.youkai, "リン", "2ダメージを与える怪異", done, (t) => {
            Game.markEffectUsed(Game.turnUseKey(ctx.side, "MURA-005"));
            dmg(ctx, t, 2);
            done();
          });
        } };
        D["MURA-007"] = { static(src, target, st) {
          if (target !== src) return null;
          return countTrait(st.players[src.owner].trash, "村") >= 5 ? { speed: 1, hp: 0, note: "コハク：スピード+1" } : null;
        } };
        D["MURA-008"] = { enter(ctx, done) {
          discardOwnChoice(ctx, 1, () => {
            if (ctx.isOver()) {
              done();
              return;
            }
            takeFromTrash(ctx, (c) => isUnit(c) && hasTrait(c, "村") && nameOf(c) !== "朽ちゆく嗤い案山子", "案山子", done);
          }, "案山子");
        } };
        D["MURA-009"] = { static(src, target, st) {
          const o = st.players[src.owner];
          if (countTrait(o.trash, "村") < 10) return null;
          if (target.owner === src.owner) return null;
          return { speed: -1, hp: 0, note: "ヌシ様：スピード-1" };
        } };
        D["MURA-011"] = { goodsBonus(g, host, st) {
          const o = st.players[g.owner];
          return o.trash.length >= 10 ? { speed: 1, hp: 0 } : { speed: 0, hp: 0 };
        } };
        D["MURA-012"] = { event(ctx, done) {
          discardOwnChoice(ctx, 1, () => {
            if (ctx.isOver()) {
              done();
              return;
            }
            drawN(ctx, 2);
            done();
          }, "境界線");
        } };
        D["MURA-013"] = { event(ctx, done) {
          discardOwnChoice(ctx, 1, () => {
            if (ctx.isOver()) {
              done();
              return;
            }
            const cands = ctx.me.trash.filter((c) => (isUnit(c) || c.master.type === "goods") && hasTrait(c, "村"));
            if (!cands.length) {
              ctx.log("不発：回収できるカードがありません");
              done();
              return;
            }
            ctx.pickCards({ title: "引き戻す力", message: "手札へ加えるカードを選んでください", cards: cands, count: 1, mode: "exact" }, (chosen) => {
              if (chosen && chosen.length) {
                Game.moveTrashToHand(ctx.side, chosen[0]);
                ctx.showCards(chosen, done);
                return;
              }
              done();
            });
          }, "引き戻す力");
        } };
        D["FIELD-MURA"] = { endTurn(ctx, done) {
          if (!ctx.me.deck.length) {
            done();
            return;
          }
          ctx.confirmYesNo("～ヨマモリ村～", "山札の上から1枚をトラッシュへ置きますか？", (yes) => {
            if (yes) Game.trashTopOfDeck(ctx.side, 1);
            else ctx.log("発動しない：～ヨマモリ村～");
            done();
          });
        } };
        D["YAKATA-002"] = { leave(ctx, done) {
          lookTake(ctx, 3, (c) => isUnit(c) && hasTrait(c, "洋館"), { reveal: true, bottom: "random" }, done);
        } };
        D["YAKATA-005"] = { enter(ctx, done) {
          const looked = Game.lookTopOfDeck(ctx.side, 5);
          ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
          if (!looked.length) {
            done();
            return;
          }
          const ge = looked.filter((c) => (c.master.type === "goods" || c.master.type === "event") && hasTrait(c, "洋館"));
          const isa = looked.filter((c) => nameOf(c) === "企む貴婦人 イザベラ");
          const taken = [];
          const step = (list, title, next) => {
            if (!list.length) {
              next();
              return;
            }
            ctx.pickCards({ title, message: "手札へ加えるカードを選んでください（0〜1枚）", cards: looked, selectable: list, count: 1, mode: "max" }, (ch) => {
              if (ch && ch.length) taken.push(ch[0]);
              next();
            });
          };
          step(ge, "シルヴィ（1/2）", () => step(isa, "シルヴィ（2/2）", () => {
            Game.resolveLook(ctx.side, looked, taken, true, "random");
            ctx.showCards(taken, done);
          }));
        } };
        D["YAKATA-006"] = { leave(ctx, done) {
          if (hasTrait(ctx.me.field, "洋館")) Game.recoverEnergy(ctx.side, 1, "クロード");
          else ctx.log("不発：フィールドが〔洋館〕ではない");
          done();
        } };
        D["YAKATA-009"] = {
          enter(ctx, done) {
            if (!onceGame(ctx, "YAKATA-009")) {
              ctx.log("不発：【ゲーム中に1回】使用済み");
              done();
              return;
            }
            Game.summonFromLost(ctx.side, "屋敷の令嬢 エリーゼ", true);
            done();
          },
          static(src, target, st) {
            const o = st.players[src.owner];
            if (countTrait(o.lost, "洋館") < 3) return null;
            if (target.owner !== src.owner) return null;
            if (!(target.master.type === "youkai" && hasTrait(target, "洋館") || nameOf(target) === "屋敷の令嬢 エリーゼ")) return null;
            return { speed: 2, hp: 2, note: "イザベラ：スピード・体力+2" };
          },
          targetImmunity: true
        };
        D["YAKATA-010"] = { assaultReduction(g, human, st) {
          const o = st.players[g.owner];
          const isa = units(o).some((c) => nameOf(c) === "企む貴婦人 イザベラ");
          return { amount: isa ? 4 : 2, trashAfterUse: true };
        } };
        D["YAKATA-011"] = { goodsBonus(g, host, st) {
          const o = st.players[g.owner];
          return o.lost.length >= 3 ? { speed: 1, hp: 0 } : { speed: 0, hp: 0 };
        } };
        D["YAKATA-012"] = { event(ctx, done) {
          if (!units(ctx.me).some((c) => nameOf(c) === "企む貴婦人 イザベラ")) {
            ctx.log("不発：イザベラがいない");
            done();
            return;
          }
          pickOppTarget(ctx, ctx.opponent.youkai, "黒薔薇の策略", "2ダメージを与える怪異", done, (t) => {
            dmg(ctx, t, 2);
            done();
          });
        } };
        D["FIELD-YAKATA"] = { lostThird(ctx, done) {
          if (countTrait(ctx.me.lost, "洋館") >= 3) Game.recoverEnergy(ctx.side, 1, "～黒薔薇の館～");
          else ctx.log("不発：ロストの〔洋館〕が3枚未満");
          done();
        } };
        D["YAKATA-018"] = { enter(ctx, done) {
          if (countTrait(ctx.me.lost, "洋館") < 3) {
            ctx.log("不発：ロストの〔洋館〕が3枚未満");
            done();
            return;
          }
          drawN(ctx, 1);
          done();
        } };
        const danchiSmall = (c) => c.master.type === "youkai" && hasTrait(c, "団地") && originalCost(c) <= 1;
        function summonOneFromTrash(ctx, filterFn, title, done) {
          const cands = ctx.me.trash.filter(filterFn);
          if (!cands.length || ctx.me.youkai.length >= MAX_YOUKAI) {
            ctx.log("不発：" + title);
            done();
            return;
          }
          ctx.pickCards({ title, message: "トラッシュから場に出す怪異を選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
            if (ch && ch.length) Game.summonFromTrash(ctx.side, ch[0], 0, title);
            done();
          });
        }
        D["DANCHI-004"] = { leave(ctx, done) {
          lookTake(ctx, 3, (c) => isUnit(c) && hasTrait(c, "団地"), { bottom: "choose" }, done);
        } };
        D["DANCHI-005"] = { enter(ctx, done) {
          summonOneFromTrash(ctx, danchiSmall, "団人4", done);
        } };
        D["DANCHI-008"] = { leave(ctx, done) {
          takeFromTrash(ctx, (c) => c.master.type === "goods", "団怪3", done);
        } };
        D["DANCHI-009"] = { enter(ctx, done) {
          summonOneFromTrash(ctx, danchiSmall, "団怪4", done);
        } };
        D["DANCHI-012"] = { event(ctx, done) {
          if (!onceGame(ctx, "DANCHI-012")) {
            ctx.log("不発：【ゲーム中に1回】使用済み");
            done();
            return;
          }
          const cands = ctx.me.trash.filter(danchiSmall);
          const free = Math.max(0, MAX_YOUKAI - ctx.me.youkai.length);
          const need = Math.min(2, free, cands.length);
          if (need <= 0) {
            ctx.log("不発：出せる怪異がない");
            done();
            return;
          }
          ctx.pickCards({ title: "団イ", message: "トラッシュから場に出す怪異を" + need + "枚選んでください", cards: cands, count: need, mode: "exact" }, (ch) => {
            (ch || []).forEach((c) => Game.summonFromTrash(ctx.side, c, 0, "団イ"));
            done();
          });
        } };
        D["FIELD-DANCHI"] = { static(src, target, st) {
          const o = st.players[src.owner];
          if (target.owner !== src.owner || o.youkai.length < 2) return null;
          if (!danchiSmall(target)) return null;
          return { speed: 1, hp: 0, note: "～ループ団地～：スピード+1" };
        } };
        D["DANCHI-020"] = { enter(ctx, done) {
          takeFromTrash(ctx, (c) => c.master.type === "youkai" && hasTrait(c, "団地") && originalCost(c) <= 1, "団C", done);
        } };
        const gakkoSmall = (c) => c.master.type === "youkai" && hasTrait(c, "学校") && originalCost(c) <= 1;
        const gakkoCost = (side, inst, m, st) => {
          const n = st.players[side].trash.filter(gakkoSmall).length;
          return [{ delta: -n, floor: 1, note: "〔学校〕怪異-" + n + "（下限1）" }];
        };
        D["GAKKO-005"] = { enter(ctx, done) {
          lookTake(ctx, 3, (c) => c.master.type === "human" && hasTrait(c, "学校"), { reveal: true, bottom: "trash" }, done);
        } };
        D["GAKKO-007"] = { leave(ctx, done) {
          lookTake(ctx, 1, (c) => c.master.type === "youkai" && hasTrait(c, "学校"), { bottom: "choose" }, done);
        } };
        D["GAKKO-008"] = { endTurn(ctx, done) {
          if (!ctx.me.humans.some((c) => hasTrait(c, "学校"))) {
            ctx.log("学怪c：〔学校〕人間がいないためトラッシュへ");
            Game._leaveField(ctx.source, "trash", "学怪c");
          }
          done();
        } };
        D["GAKKO-010"] = {
          cost: gakkoCost,
          statReductionImmunity: true,
          enter(ctx, done) {
            if (!onceGame(ctx, "GAKKO-010")) {
              ctx.log("不発：【ゲーム中に1回】使用済み");
              done();
              return;
            }
            const list = ctx.opponent.youkai.filter((c) => originalCost(c) <= 4);
            list.forEach((c) => Game._leaveField(c, "trash", "赤マント"));
            if (!list.length) ctx.log("不発：対象なし");
            done();
          }
        };
        D["GAKKO-024"] = {
          cost: gakkoCost,
          enter(ctx, done) {
            if (!onceGame(ctx, "GAKKO-024")) {
              ctx.log("不発：【ゲーム中に1回】使用済み");
              done();
              return;
            }
            pickOppTarget(ctx, ctx.opponent.youkai.filter((c) => ctx.state.tracking[c.owner] && ctx.state.tracking[c.owner].youkai === c), "切り札2", "追跡を解除する怪異", done, (t) => {
              Game.clearPursuitOf(t, "切り札2");
              done();
            });
          },
          // 【ターンに1回】 activated ability during main: summon a 〔学校〕 cost≤1 youkai from trash paying its cost
          abilities: [{
            key: "GAKKO-024:summon",
            label: "トラッシュから〔学校〕コスト1以下の怪異を出す（コスト支払い）",
            candidates(side, inst, st) {
              if (Game.isEffectUsed(Game.turnUseKey(side, "GAKKO-024:summon"))) return [];
              if (st.players[side].youkai.length >= MAX_YOUKAI) return [];
              return st.players[side].trash.filter((c) => c.master.type === "youkai" && hasTrait(c, "学校") && Game.effectiveCost(side, c) <= 1 && st.players[side].energy >= Game.effectiveCost(side, c));
            },
            run(side, inst, target, st) {
              Game.markEffectUsed(Game.turnUseKey(side, "GAKKO-024:summon"));
              return Game.summonFromTrash(side, target, Game.effectiveCost(side, target), "切り札2");
            }
          }]
        };
        D["GAKKO-011"] = { zoneLockTrash: true };
        D["GAKKO-012"] = { ownAssault(ctx, done) {
          if (!ctx.item.humansLost) {
            done();
            return;
          }
          drawN(ctx, 1);
          if (ctx.isOver()) {
            done();
            return;
          }
          discardOwnChoice(ctx, 1, () => done(), "学グ2");
        } };
        D["GAKKO-013"] = { event(ctx, done) {
          pickOwnTarget(ctx, ctx.me.youkai, "学イ1", "スピード+2する怪異", done, (t) => {
            pump(ctx, t, 2, 0, ownAssaultUntil(ctx));
            done();
          });
        } };
        D["GAKKO-014"] = { event(ctx, done) {
          Game.addTempEffect({ kind: "effectDamageReduction", owner: ctx.side, target: { owner: ctx.side, types: ["human", "youkai"] }, amount: 1, until: nextTurnStartUntil(), note: "学イ2" });
          ctx.log("学イ2：次の自分のターン開始時まで効果ダメージ1軽減");
          done();
        } };
        D["GAKKO-025"] = { enter(ctx, done) {
          speedDebuffNextAssault(ctx, "学人6", 2, done);
        } };
        D["FIELD-GAKKO"] = { react: { gakkoLeave(ctx, done) {
          if (Game.isEffectUsed(Game.turnUseKey(ctx.side, "FIELD-GAKKO"))) {
            done();
            return;
          }
          if (!ctx.me.deck.length) {
            done();
            return;
          }
          ctx.confirmYesNo("～学校～", "1枚ドローしますか？（そうしたなら手札1枚をデッキの下に置きます）", (yes) => {
            if (!yes) {
              done();
              return;
            }
            Game.markEffectUsed(Game.turnUseKey(ctx.side, "FIELD-GAKKO"));
            drawN(ctx, 1);
            if (ctx.isOver() || !ctx.me.hand.length) {
              done();
              return;
            }
            ctx.pickCards({ title: "～学校～", message: "デッキの下に置く手札を1枚選んでください", cards: ctx.me.hand.slice(), count: 1, mode: "exact" }, (ch) => {
              if (ch && ch.length) {
                Game._removeFromHand(ctx.side, ch[0]);
                Game.putOnBottom(ctx.side, ch, "choose");
              }
              done();
            });
          });
        } } };
        D["GAKKO-020"] = { enter(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 2);
          done();
        } };
        D["SHOTEN-004"] = { enter(ctx, done) {
          const cands = ctx.me.hand.filter((c) => c.master.type === "goods" && hasTrait(c, "商店街"));
          if (!cands.length) {
            done();
            return;
          }
          ctx.pickCards({ title: "商人3", message: "トラッシュに置く〔商店街〕グッズを選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
            if (ch && ch.length) {
              Game.discardFromHand(ctx.side, ch, "商人3");
              drawN(ctx, 1);
            }
            done();
          });
        } };
        D["SHOTEN-009"] = { leave(ctx, done) {
          lookTake(ctx, 3, (c) => c.master.type === "goods" && hasTrait(c, "商店街"), { bottom: "choose" }, done);
        } };
        D["SHOTEN-010"] = { onEquip(ctx, done) {
          pickOppTarget(ctx, ctx.opponent.youkai, "商グ4", "1ダメージを与える怪異", done, (t) => {
            dmg(ctx, t, 1);
            done();
          });
        } };
        D["SHOTEN-011"] = { onEquip(ctx, done) {
          drawN(ctx, 1);
          if (ctx.isOver()) {
            done();
            return;
          }
          discardOwnChoice(ctx, 1, () => done(), "商グ2");
        } };
        D["SHOTEN-012"] = { onEquip(ctx, done) {
          const host = ctx.source.equippedTo;
          if (!host || nameOf(host).indexOf("切り札") === -1) {
            ctx.log("不発：装備先が切り札ではない");
            done();
            return;
          }
          pickOppTarget(ctx, ctx.opponent.youkai, "商グ5", "2ダメージを与える怪異", done, (t) => {
            dmg(ctx, t, 2);
            done();
          });
        } };
        D["SHOTEN-013"] = { event(ctx, done) {
          const cands = ctx.me.hand.filter((c) => c.master.type === "goods" && hasTrait(c, "商店街"));
          if (!cands.length) {
            ctx.log("不発：〔商店街〕グッズが手札にない");
            done();
            return;
          }
          ctx.pickCards({ title: "商イ1", message: "トラッシュに置く〔商店街〕グッズを好きな枚数選んでください", cards: cands, count: cands.length, mode: "max" }, (ch) => {
            const n = Game.discardFromHand(ctx.side, ch || [], "商イ1").length;
            drawN(ctx, n);
            done();
          });
        } };
        D["SHOTEN-027"] = { enter(ctx, done) {
          const host = ctx.source;
          const cands = ctx.me.trash.filter((c) => c.master.type === "goods" && hasTrait(c, "商店街"));
          if (!cands.length) {
            done();
            return;
          }
          ctx.pickCards({ title: "商店街の切り札", message: "トラッシュからこのカードに装備する〔商店街〕グッズを好きな枚数選んでください（同名は1枚ずつ）", cards: cands, count: cands.length, mode: "max" }, (ch) => {
            const list = (ch || []).slice();
            list.forEach((g) => {
              if (Game._canEquipMore(host, g)) Game.equipFromTrash(ctx.side, g, host);
              else ctx.log("装備不可（同名）：" + nameOf(g));
            });
            Game.recalcAndResolveDeaths("装備時");
            done();
          });
        } };
        D["FIELD-SHOTEN"] = {
          cost(side, inst, m, st) {
            if (m.type === "goods" && st.players[side].turnUse.goods === 0) return [{ delta: -1, note: "～商店街～：このターン初めてのグッズ-1" }];
            return [];
          },
          react: { shotenGoodsUsed(ctx, done) {
            if (Game.isEffectUsed(Game.turnUseKey(ctx.side, "FIELD-SHOTEN"))) {
              done();
              return;
            }
            Game.markEffectUsed(Game.turnUseKey(ctx.side, "FIELD-SHOTEN"));
            drawN(ctx, 1);
            done();
          } }
        };
        D["CHIKA-003"] = { startTurn(ctx, done) {
          const me = ctx.me;
          const others = me.humans.filter((c) => c !== ctx.source);
          if (!others.length || me.trash.filter((c) => c.master.type === "youkai" && hasTrait(c, "地下")).length < 3) {
            done();
            return;
          }
          if (me.youkai.length >= MAX_YOUKAI) {
            ctx.log("変身不可：怪異エリアが上限");
            done();
            return;
          }
          ctx.confirmYesNo("シズ（表）", "裏面（怪異）に変身しますか？", (yes) => {
            if (yes) Game.transform(ctx.source, 1, "シズ");
            done();
          });
        } };
        D["CHIKA-004"] = { enter(ctx, done) {
          lookTake(ctx, 5, (c) => c.master.type === "youkai" && hasTrait(c, "巨人"), { bottom: "choose" }, done);
        } };
        D["CHIKA-006"] = { pursuitRestriction(side, yk, humans, st) {
          const def2 = st.players[otherSide(side)];
          if (!hasTrait(def2.field, "地下")) return null;
          const taunts = def2.humans.filter((c) => nameOf(c) === "挑発");
          if (!taunts.length) return null;
          return humans.some((h) => nameOf(h) !== "挑発") ? "挑発：この人間は追跡できない" : null;
        } };
        D["CHIKA-008"] = { leave(ctx, done) {
          lookTake(ctx, 1, (c) => c.master.type === "youkai" && hasTrait(c, "巨人"), { bottom: "choose" }, done);
        } };
        D["CHIKA-010"] = { enter(ctx, done) {
          const list = ctx.opponent.youkai.slice();
          if (!list.length) ctx.log("不発：相手の怪異がいない");
          list.forEach((c) => dmg(ctx, c, 3));
          done();
        } };
        D["CHIKA-011"] = { pursuitRestriction(side, yk, humans, st) {
          const def2 = st.players[otherSide(side)];
          if (def2.youkai.some((c) => nameOf(c) === "コモン巨人") && originalCost(yk) <= 2) return "コモン巨人：元のコスト2以下の怪異は追跡できない";
          return null;
        } };
        D["CHIKA-012"] = { goodsBonus(g, host) {
          return hasTrait(host, "巨人") ? { speed: 2, hp: 0 } : { speed: 0, hp: 0 };
        } };
        D["CHIKA-013"] = { event(ctx, done) {
          Game.addTempEffect({ kind: "stat", owner: ctx.side, target: { owner: ctx.side, types: ["human"], trait: "地下" }, speed: 0, hp: 2, until: nextTurnStartUntil(), note: "地イ：体力+2" });
          ctx.log("地イ：〔地下〕人間の体力+2（次の自分のターン開始時まで）");
          done();
        } };
        D["CHIKA-024"] = { enter(ctx, done) {
          if (!hasTrait(ctx.me.field, "地下")) {
            ctx.log("不発：フィールドが〔地下〕ではない");
            done();
            return;
          }
          const opp = otherSide(ctx.side);
          const tr = ctx.state.tracking[opp];
          const cands = ctx.opponent.youkai.filter((c) => tr && tr.youkai === c);
          if (!cands.length) {
            ctx.log("不発：追跡している怪異がいない");
            done();
            return;
          }
          pickOppTarget(ctx, cands, "地人8", "追跡を解除する怪異", done, (t) => {
            Game.clearPursuitOf(t, "地人8");
            done();
          });
        } };
        D["FIELD-CHIKA"] = { cost(side, inst, m, st) {
          const p = st.players[side];
          if (!p.youkai.some((c) => hasTrait(c, "巨人"))) return [];
          if (!(m.traits || []).includes("地下") || p.turnUse.chika !== 0) return [];
          return [{ delta: -2, floor: 1, note: "～地下～：このターン初めての〔地下〕-2（下限1）" }];
        } };
        D["CHIKA-021"] = { enter(ctx, done) {
          if (ctx.me.trash.filter((c) => c.master.type === "youkai" && hasTrait(c, "地下")).length < 3) {
            ctx.log("不発：トラッシュの〔地下〕怪異が3枚未満");
            done();
            return;
          }
          speedDebuffNextAssault(ctx, "地怪3", 2, done);
        } };
        D["MORI-003"] = { leave(ctx, done) {
          lookTake(ctx, 2, (c) => c.master.type === "human" && hasTrait(c, "森"), { bottom: "choose" }, done);
        } };
        D["MORI-004"] = {
          // R3: 下限 4 → 1（トキの軽減が -2 上限になったので下限で縛る必要がなくなった）
          handCost(side, inst, m, st, src) {
            if (src && units(st.players[side]).find((c) => nameOf(c) === "ルピア") !== src) return [];
            if (m.type === "human" && (m.traits || []).includes("森") && (typeof m.cost === "number" ? m.cost : 0) >= 8) return [{ delta: -2, floor: 1, note: "ルピア：-2（下限1、重複しない）" }];
            return [];
          },
          // R3 追加: 【ターンに1回】【離れた時】自分の場に「トキ」があるなら気力+1。
          //   ターンに1回は cardId 単位なので、トキの全バウンスで4枚同時に戻っても +1 で止まる。
          leave(ctx, done) {
            if (!ctx.me.humans.some((c) => nameOf(c) === "トキ")) {
              ctx.log("不発：自分の場に「トキ」がいない");
              done();
              return;
            }
            const key = Game.turnUseKey(ctx.side, "MORI-004");
            if (Game.isEffectUsed(key)) {
              ctx.log("不発：【ターンに1回】使用済み");
              done();
              return;
            }
            Game.markEffectUsed(key);
            Game.recoverEnergy(ctx.side, 1, "ルピア");
            done();
          }
        };
        D["MORI-005"] = {
          // R3: ロスト〔森〕1枚ごと → 2枚ごとに -1（上限5なので生きている間の最大は -2 ＝ 8。ルピアと合わせて 6）
          cost(side, inst, m, st) {
            const n = Math.floor(countTrait(st.players[side].lost, "森") / 2);
            return n ? [{ delta: -n, note: "トキ：ロストの〔森〕2枚ごとに-" + n }] : [];
          },
          // R3: 相手の怪異を全バウンスした後、自分の「トキ」以外の人間もすべて手札に戻す（死地から救い出す）
          enter(ctx, done) {
            const list = ctx.opponent.youkai.slice();
            list.forEach((c) => Game.returnToHand(c, "トキ"));
            if (!list.length) ctx.log("不発：相手の怪異がいない");
            if (ctx.isOver()) {
              done();
              return;
            }
            const mine = ctx.me.humans.filter((c) => nameOf(c) !== "トキ");
            mine.forEach((c) => Game.returnToHand(c, "トキ"));
            done();
          },
          // R3: 〔森〕怪異の速+2 はフィールドへ移した（重複を避ける）
          pursuitRestriction(side, yk, humans, st) {
            const def2 = st.players[otherSide(side)];
            if (def2.humans.some((c) => nameOf(c) === "トキ") && yk.enteredTurn === st.turnCount) return "トキ：場に出たターンは追跡できない";
            return null;
          }
        };
        D["MORI-018"] = { static(src, target, st) {
          if (target !== src) return null;
          const n = Math.floor(countTrait(st.players[src.owner].lost, "森") / 2);
          return n ? { speed: 0, hp: n, note: "森怪5：体力+" + n } : null;
        } };
        D["MORI-006"] = {
          cost(side, inst, m, st) {
            return countTrait(st.players[side].lost, "森") >= 3 ? [{ fix: 6, note: "サワ：コスト6に固定" }] : [];
          },
          // R2: 3 → 6（v1.1 の値に戻す）
          enter(ctx, done) {
            pickOppTarget(ctx, ctx.opponent.youkai, "サワ", "3ダメージを与える怪異", done, (t) => {
              dmg(ctx, t, 3);
              done();
            });
          },
          endTurn(ctx, done) {
            pickOppTarget(ctx, ctx.opponent.youkai, "サワ", "1ダメージを与える怪異", done, (t) => {
              dmg(ctx, t, 1);
              done();
            });
          }
        };
        D["MORI-012"] = { event(ctx, done) {
          if (ctx.me.humans.length < 2) {
            ctx.log("不発：人間が2枚未満");
            done();
            return;
          }
          const cands = ctx.me.humans.filter((c) => hasTrait(c, "森"));
          if (!cands.length) {
            ctx.log("不発：〔森〕人間がいない");
            done();
            return;
          }
          ctx.pickCards({ title: "供物", message: "ロストゾーンに置く〔森〕人間を選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
            if (ch && ch.length) {
              Game.sacrificeToLost(ctx.side, ch[0], "供物");
              if (!ctx.isOver()) Game.recoverEnergy(ctx.side, 2, "供物");
            }
            done();
          });
        } };
        D["MORI-022"] = { enter(ctx, done) {
          const cands = ctx.me.humans.slice();
          if (!cands.length) {
            ctx.log("不発：自分の人間がいない");
            done();
            return;
          }
          ctx.pickCards({ title: "森怪9", message: "ロストゾーンに置く人間を選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
            if (!ch || !ch.length) {
              ctx.log("森怪9：人間を置かなかった");
              done();
              return;
            }
            Game.sacrificeToLost(ctx.side, ch[0], "森怪9");
            if (ctx.isOver()) {
              done();
              return;
            }
            pickOppTarget(ctx, ctx.opponent.youkai, "森怪9", "3ダメージを与える怪異", done, (t) => {
              dmg(ctx, t, 3);
              done();
            });
          });
        } };
        D["MORI-023"] = { enter(ctx, done) {
          const looked = Game.lookTopOfDeck(ctx.side, 5);
          ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
          if (!looked.length) {
            done();
            return;
          }
          const boss = looked.filter((c) => nameOf(c) === "トキ" || nameOf(c) === "サワ");
          const taken = [];
          const step = (list, title, next) => {
            if (!list.length) {
              next();
              return;
            }
            ctx.pickCards({ title, message: "手札へ加えるカードを選んでください（0〜1枚）", cards: looked, selectable: list, count: 1, mode: "max" }, (ch) => {
              if (ch && ch.length) taken.push(ch[0]);
              next();
            });
          };
          step(boss, "森人7（1/2）", () => {
            const mori = looked.filter((c) => (c.master.type === "human" || c.master.type === "youkai") && hasTrait(c, "森") && taken.indexOf(c) === -1);
            step(mori, "森人7（2/2）", () => {
              Game.resolveLook(ctx.side, looked, taken, true, "random");
              ctx.showCards(taken, done);
            });
          });
        } };
        D["MORI-024"] = { leave(ctx, done) {
          lookTake(ctx, 3, (c) => c.master.type === "human", { bottom: "choose" }, done);
        } };
        D["FIELD-MORI"] = { static(src, target, st) {
          const o = st.players[src.owner];
          if (target.owner !== src.owner || target.master.type !== "youkai" || !hasTrait(target, "森")) return null;
          return countTrait(o.lost, "森") >= 4 ? { speed: 2, hp: 0, note: "～禁足の森～：スピード+2（ロスト〔森〕4枚以上）" } : null;
        } };
        function rockTransform(ctx, payN, done) {
          if (!ctx.item.humansLost) {
            done();
            return;
          }
          if (ctx.me.energy < payN) {
            ctx.log("不発：気力不足（" + payN + "）");
            done();
            return;
          }
          const inst = ctx.source;
          if (!inst.faces || inst.faceIndex + 1 >= inst.faces.length) {
            done();
            return;
          }
          ctx.confirmYesNo(nameOf(inst), "気力を" + payN + "支払って次の面に変身しますか？", (yes) => {
            if (yes) {
              ctx.me.energy -= payN;
              ctx.log("気力支払い：" + payN);
              Game.transform(inst, inst.faceIndex + 1, "襲撃");
            }
            done();
          });
        }
        D["SHIMA-001"] = { ownAssault(ctx, done) {
          rockTransform(ctx, 2, done);
        } };
        D["SHIMA-002"] = { ownAssault(ctx, done) {
          rockTransform(ctx, 3, done);
        }, enter(ctx, done) {
          drawN(ctx, 1);
          done();
        } };
        D["SHIMA-003"] = { enter(ctx, done) {
          const list = ctx.opponent.youkai.slice();
          list.forEach((c) => dmg(ctx, c, 2));
          if (!list.length) ctx.log("不発：相手の怪異がいない");
          done();
        } };
        D["SHIMA-008"] = { enter(ctx, done) {
          takeFromTrash(ctx, (c) => nameOf(c) === "岩の子", "島人4", done);
        } };
        D["SHIMA-009"] = { enter(ctx, done) {
          lookTake(ctx, 3, (c) => nameOf(c) === "岩の子", { bottom: "choose" }, done);
        } };
        D["SHIMA-011"] = { event(ctx, done) {
          pickOwnTarget(ctx, ctx.me.youkai.filter((c) => hasTrait(c, "岩")), "回復", "ダメージを取り除く怪異", done, (t) => {
            Game.healDamage(t, null);
            done();
          });
        } };
        D["SHIMA-012"] = { event(ctx, done) {
          Game.addTempEffect({ kind: "pursuitProtect", owner: ctx.side, target: { owner: ctx.side, types: ["youkai"], trait: "岩" }, until: nextTurnStartUntil(), note: "潮鳴り" });
          ctx.log("潮鳴り：〔岩〕怪異の追跡を保護");
          done();
        } };
        D["SHIMA-013"] = { event(ctx, done) {
          Game.addTempEffect({ kind: "effectDamageReduction", owner: ctx.side, target: { owner: ctx.side, types: ["youkai"], trait: "岩" }, amount: 2, until: nextTurnStartUntil(), note: "岩イ3" });
          ctx.log("岩イ3：〔岩〕怪異の効果ダメージ2軽減");
          done();
        } };
        D["SHIMA-014"] = { event(ctx, done) {
          Game.addTempEffect({ kind: "stat", owner: ctx.side, target: { owner: ctx.side, types: ["youkai"], trait: "岩" }, speed: 2, hp: 0, until: ownAssaultUntil(ctx), note: "岩イ4：スピード+2" });
          ctx.log("岩イ4：次の自分の襲撃時〔岩〕怪異スピード+2");
          done();
        } };
        D["SHIMA-027"] = { enter(ctx, done) {
          Game.addTempEffect({
            kind: "allDamageReduction",
            owner: ctx.side,
            target: { uid: ctx.source.uid },
            amount: 3,
            until: { type: "oppNextTurnEnd", setTurn: ctx.state.turnCount },
            note: "島人11：ダメージ3軽減"
          });
          ctx.log("島人11：次の相手のターン終了時まで、受けるダメージを3軽減");
          done();
        } };
        D["SHIMA-028"] = { enter(ctx, done) {
          speedDebuffNextAssault(ctx, "島人12", 2, done);
        } };
        D["FIELD-SHIMA"] = {
          playRestriction(side, inst, m, st) {
            if (m.type === "youkai" && !(m.traits || []).includes("岩")) return "～島～：〔岩〕を持たない怪異は場に出せない";
            return null;
          },
          startTurn(ctx, done) {
            if (ctx.me.youkai.length) {
              done();
              return;
            }
            const cands = ctx.me.hand.filter((c) => nameOf(c) === "岩の子" && Game.canPlay(ctx.side, c, { free: true }).ok);
            if (!cands.length) {
              done();
              return;
            }
            ctx.pickCards({ title: "～島～", message: "コストを支払わずに出す「岩の子」を選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
              if (ch && ch.length) Game.playUnit(ctx.side, ch[0], { free: true });
              done();
            });
          }
        };
        D["HOTEL-003"] = { enter(ctx, done) {
          const looked = Game.lookTopOfDeck(ctx.side, 5);
          ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
          if (!looked.length) {
            done();
            return;
          }
          const dp = looked.filter((c) => c.master.type === "youkai" && hasKeyword(c, "【二重追跡】"));
          const ev = looked.filter((c) => c.master.type === "event" && hasTrait(c, "ホテル"));
          const taken = [];
          const step = (list, title, next) => {
            if (!list.length) {
              next();
              return;
            }
            ctx.pickCards({ title, message: "手札へ加えるカードを選んでください（0〜1枚）", cards: looked, selectable: list, count: 1, mode: "max" }, (ch) => {
              if (ch && ch.length) taken.push(ch[0]);
              next();
            });
          };
          step(dp, "マルグリット（1/2）", () => step(ev, "マルグリット（2/2）", () => {
            Game.resolveLook(ctx.side, looked, taken, true, "random");
            ctx.showCards(taken, done);
          }));
        } };
        D["HOTEL-004"] = { react: { vilma(ctx, done) {
          if (!hasTrait(ctx.me.field, "ホテル")) {
            done();
            return;
          }
          if (Game.isEffectUsed(Game.turnUseKey(ctx.side, "HOTEL-004"))) {
            done();
            return;
          }
          Game.markEffectUsed(Game.turnUseKey(ctx.side, "HOTEL-004"));
          Game.recoverEnergy(ctx.side, 1, "ヴィルマ");
          done();
        } } };
        D["HOTEL-006"] = { leave(ctx, done) {
          lookTake(ctx, 1, (c) => nameOf(c) === "支配人", { bottom: "choose" }, done);
        } };
        D["HOTEL-009"] = { enter(ctx, done) {
          forcedOppPlay(ctx, true, done);
        } };
        D["HOTEL-010"] = { enter(ctx, done) {
          forcedOppPlay(ctx, false, done);
        } };
        D["HOTEL-011"] = { event(ctx, done) {
          forcedOppPlay(ctx, false, done);
        } };
        D["HOTEL-012"] = { event(ctx, done) {
          pickOwnTarget(ctx, ctx.me.youkai.filter((c) => hasKeyword(c, "【二重追跡】")), "深夜営業", "スピード+2する【二重追跡】怪異", done, (t) => {
            pump(ctx, t, 2, 0, ownAssaultUntil(ctx));
            done();
          });
        } };
        D["HOTEL-017"] = { enter(ctx, done) {
          if (!hasTrait(ctx.me.field, "ホテル")) {
            ctx.log("不発：フィールドが〔ホテル〕ではない");
            done();
            return;
          }
          Game.addTempEffect({ kind: "pursuitBan", owner: ctx.side, banSide: otherSide(ctx.side), target: null, until: { type: "oppTurnEnd" }, note: "リンデ：次の相手のターン、追跡できない" });
          ctx.log("リンデ：次の相手のターン、相手は追跡できない");
          done();
        } };
        D["FIELD-HOTEL"] = { cost(side, inst, m, st) {
          const p = st.players[side];
          if (m.type !== "event" || !(m.traits || []).includes("ホテル")) return [];
          if (!p.youkai.some((c) => hasKeyword(c, "【二重追跡】"))) return [];
          if (p.turnUse.hotelEvent) return [];
          return [{ delta: -1, note: "～雪山ホテル～：〔ホテル〕イベント-1（ターンに1回）" }];
        } };
        D["YORU-004"] = { react: { yoruDiscard(ctx, done) {
          if (!hasTrait(ctx.me.field, "夜の街")) {
            done();
            return;
          }
          if (Game.isEffectUsed(Game.turnUseKey(ctx.side, "YORU-004"))) {
            done();
            return;
          }
          Game.markEffectUsed(Game.turnUseKey(ctx.side, "YORU-004"));
          drawN(ctx, 1);
          done();
        } } };
        D["YORU-006"] = { react: { gakumeEvent(ctx, done) {
          opponentDiscards(ctx, 1, () => done(), "学メ1");
        } } };
        D["YORU-007"] = { enter(ctx, done) {
          opponentDiscards(ctx, 1, () => done());
        } };
        D["YORU-008"] = { enter(ctx, done) {
          Game.discardRandomFromHand(otherSide(ctx.side), 1, "影の人B");
          done();
        } };
        D["YORU-009"] = { static(src, target, st) {
          if (target !== src) return null;
          return st.players[otherSide(src.owner)].hand.length <= 3 ? { speed: 1, hp: 1, note: "怪物：+1/+1" } : null;
        } };
        D["YORU-010"] = { enter(ctx, done) {
          Game.discardRandomFromHand(otherSide(ctx.side), 1, "怪物（大）");
          if (ctx.opponent.hand.length <= 3) Game.discardRandomFromHand(otherSide(ctx.side), 1, "怪物（大）");
          done();
        } };
        D["YORU-011"] = { enter(ctx, done) {
          lookerDiscards(ctx, 1, () => done());
        }, static(src, target, st) {
          if (target !== src) return null;
          return st.players[otherSide(src.owner)].hand.length <= 3 ? { speed: 2, hp: 2, note: "ビルの巨人：+2/+2" } : null;
        } };
        D["YORU-013"] = { event(ctx, done) {
          Game.discardRandomFromHand(otherSide(ctx.side), 2, "霧");
          done();
        } };
        D["YORU-014"] = { event(ctx, done) {
          const hand = ctx.opponent.hand.slice();
          Game.recordHandLook(ctx.side, hand);
          ctx.log("輪郭：相手の手札を見た（" + hand.length + "枚・見た側だけが知る）");
          ctx.showCards(hand, done);
        } };
        D["YORU-026"] = { oppAssault(ctx, done) {
          const info = ctx.item.info;
          if (!info || info.defenders.indexOf(ctx.source) === -1) {
            done();
            return;
          }
          const yk = info.attacker;
          if (!yk || ctx.opponent.youkai.indexOf(yk) === -1) {
            ctx.log("不発：襲撃した怪異が場にいない");
            done();
            return;
          }
          dmg(ctx, yk, 2);
          done();
        } };
        D["YORU-027"] = { enter(ctx, done) {
          if (ctx.opponent.hand.length > 3) {
            ctx.log("不発：相手の手札が4枚以上");
            done();
            return;
          }
          pickOppTarget(ctx, ctx.opponent.youkai, "街人9", "1ダメージを与える怪異", done, (t) => {
            dmg(ctx, t, 1);
            done();
          });
        } };
        D["FIELD-YORU"] = { targetImmunityFor(card, st) {
          const o = st.players[card.owner];
          return card.master.type === "youkai" && hasTrait(card, "夜の街") && st.players[otherSide(card.owner)].hand.length <= 3 && o.field.cardId === "FIELD-YORU";
        } };
        const yuenEvent = (c) => c.master.type === "event" && hasTrait(c, "遊園地");
        D["YUEN-005"] = { enter(ctx, done) {
          const cands = ctx.me.trash.filter(yuenEvent);
          if (!cands.length) {
            ctx.log("不発：トラッシュに〔遊園地〕イベントがない");
            done();
            return;
          }
          ctx.pickCards({ title: "ソラ", message: "トラッシュから使う〔遊園地〕イベントを1枚選んでください", cards: cands, count: 1, mode: "exact" }, (ch) => {
            if (ch && ch.length) useEventFromTrash(ctx, ch[0], "stay", false, done);
            else done();
          });
        } };
        D["YUEN-008"] = { enter(ctx, done) {
          lookTake(ctx, 3, yuenEvent, { bottom: "trash" }, done);
        } };
        D["YUEN-009"] = {
          cost(side, inst, m, st) {
            const n = Math.floor(st.players[side].trash.filter(yuenEvent).length / 2);
            return n ? [{ delta: -n, floor: 4, note: "パレード：-" + n + "（下限4）" }] : [{ floor: 4 }];
          },
          enter(ctx, done) {
            const cands = ctx.me.trash.filter(yuenEvent);
            if (!cands.length) {
              ctx.log("不発：トラッシュに〔遊園地〕イベントがない");
              done();
              return;
            }
            ctx.pickCards({ title: "パレード", message: "トラッシュから使う〔遊園地〕イベントを好きな枚数選んでください", cards: cands, count: cands.length, mode: "max" }, (ch) => {
              const list = (ch || []).slice();
              if (!list.length) {
                done();
                return;
              }
              const withOrder = (ordered) => {
                ordered.forEach((ev) => {
                  Game._useEvent(ctx.side, ev, { from: "trash", cost: 0, after: "exile", ignoreOnce: true, fixedOrder: true });
                });
                done();
              };
              if (list.length > 1) ctx.pickOrder({ title: "パレード", message: "解決する順番を選んでください", items: list }, (o) => withOrder(o && o.length === list.length ? o : list));
              else withOrder(list);
            });
          }
        };
        D["YUEN-010"] = { hostLeft(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 2);
          done();
        } };
        D["YUEN-022"] = { event(ctx, done) {
          Game.addTempEffect({ kind: "effectDamageReduction", owner: ctx.side, target: { owner: ctx.side, types: ["human", "youkai"] }, amount: 1, until: nextTurnStartUntil(), note: "風船" });
          ctx.log("風船：効果ダメージ1軽減");
          done();
        } };
        D["YUEN-023"] = { event(ctx, done) {
          pickOwnTarget(ctx, ctx.me.humans, "綿あめ", "体力+1する人間", done, (t) => {
            pump(ctx, t, 0, 1, nextTurnStartUntil());
            done();
          });
        } };
        D["YUEN-024"] = { event(ctx, done) {
          pickOwnTarget(ctx, ctx.me.youkai, "メリーゴーラウンド", "スピード+1する怪異", done, (t) => {
            pump(ctx, t, 1, 0, ownAssaultUntil(ctx));
            done();
          });
        } };
        D["YUEN-025"] = { event(ctx, done) {
          pickOppTarget(ctx, ctx.opponent.youkai, "コーヒーカップ", "スピード-1する怪異", done, (t) => {
            pump(ctx, t, -1, 0, { type: "oppAssault" });
            done();
          });
        } };
        D["YUEN-026"] = { event(ctx, done) {
          const looked = Game.lookTopOfDeck(ctx.side, 2);
          if (!looked.length) {
            done();
            return;
          }
          ctx.pickCards({ title: "案内図", message: "手札に加えるカードを1枚選んでください（残りはトラッシュ）", cards: looked, count: 1, mode: "exact" }, (ch) => {
            Game.resolveLook(ctx.side, looked, ch && ch.length ? ch[0] : null, false, "trash");
            done();
          });
        } };
        D["YUEN-027"] = { event(ctx, done) {
          const cands = ctx.me.hand.filter(yuenEvent);
          if (!cands.length) {
            ctx.log("不発");
            done();
            return;
          }
          ctx.pickCards({ title: "写真館", message: "トラッシュに置く〔遊園地〕イベントを1枚選んでください", cards: cands, count: 1, mode: "exact" }, (ch) => {
            Game.discardFromHand(ctx.side, ch || [], "写真館");
            done();
          });
        } };
        D["YUEN-028"] = { event(ctx, done) {
          if (!hasTrait(ctx.me.field, "遊園地")) {
            ctx.log("不発：フィールドが〔遊園地〕ではない");
            done();
            return;
          }
          const list = ctx.opponent.youkai.slice();
          list.forEach((c) => dmg(ctx, c, 2));
          if (!list.length) ctx.log("不発：相手の怪異がいない");
          done();
        } };
        D["YUEN-029"] = { event(ctx, done) {
          const opp = otherSide(ctx.side);
          const t = ctx.state.tracking[opp];
          const ys = ctx.opponent.youkai.slice();
          if (t) Game.clearPursuitOf(t.youkai, "閉園時間");
          ys.forEach((y) => {
            if (!Game.isPursuitProtected(y)) Game.addTempEffect({ kind: "pursuitBan", owner: ctx.side, banSide: opp, target: { uid: y.uid }, until: { type: "oppAssault" }, note: "閉園時間：次の相手の襲撃時まで追跡できない" });
          });
          ctx.log("閉園時間：相手の怪異" + ys.length + "枚");
          done();
        } };
        D["YUEN-030"] = { event(ctx, done) {
          const cands = ctx.me.trash.filter((c) => c.master.type === "youkai" && hasTrait(c, "遊園地") && originalCost(c) <= 5);
          if (!cands.length || ctx.me.youkai.length >= MAX_YOUKAI) {
            ctx.log("不発");
            done();
            return;
          }
          ctx.pickCards({ title: "ナイトサファリ", message: "場に出す怪異を1枚選んでください", cards: cands, count: 1, mode: "exact" }, (ch) => {
            if (ch && ch.length) Game.summonFromTrash(ctx.side, ch[0], 0, "ナイトサファリ");
            done();
          });
        } };
        D["YUEN-031"] = { event(ctx, done) {
          topOrBottom(ctx, done);
        } };
        D["FIELD-YUEN"] = {
          cost(side, inst, m, st) {
            return m.type === "event" && (m.traits || []).includes("遊園地") ? [{ delta: -1, note: "～遊園地～：〔遊園地〕イベント-1" }] : [];
          },
          react: { yuenDraw(ctx, done) {
            const n = ctx.item.payload && ctx.item.payload.handAtUse != null ? ctx.item.payload.handAtUse : ctx.me.hand.length;
            if (n <= 5) drawN(ctx, 1);
            else ctx.log("不発：イベント使用時の手札が6枚以上（" + n + "枚）");
            done();
          } }
          // v1.1 ruling #5: judged at the time of use / R1: 7 → 5
        };
        D["YUEN-019"] = { enter(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 2);
          done();
        } };
        D["CHOKOKU-006"] = { leave(ctx, done) {
          Game.gainNoise(ctx.side, 1, "小さな彫刻");
          done();
        } };
        D["CHOKOKU-007"] = { static(src, target, st) {
          if (target !== src) return null;
          return st.players[src.owner].noise.current >= 6 ? { speed: 1, hp: 1, note: "動く彫刻：+1/+1" } : null;
        } };
        D["CHOKOKU-008"] = { oppAssault(ctx, done) {
          Game.gainNoise(ctx.side, 1, "聞いている彫刻");
          done();
        } };
        D["CHOKOKU-009"] = { enter(ctx, done) {
          Game.gainNoise(ctx.side, 3, "大きな作品");
          done();
        }, react: { bigWork(ctx, done) {
          const t = ctx.item.payload && ctx.item.payload.card;
          if (t && ctx.opponent.youkai.indexOf(t) !== -1) dmg(ctx, t, 2);
          done();
        } } };
        D["CHOKOKU-010"] = { endTurn(ctx, done) {
          Game.gainNoise(ctx.side, 2, "未完成の作品");
          done();
        } };
        D["CHOKOKU-011"] = { hostLeft(ctx, done) {
          Game.gainNoise(ctx.side, 2, "足元灯");
          done();
        } };
        D["CHOKOKU-012"] = { event(ctx, done) {
          Game.gainNoise(ctx.side, 2, "足音");
          done();
        } };
        D["CHOKOKU-013"] = { event(ctx, done) {
          if (ctx.me.noise.current < 4) {
            ctx.log("不発：物音が4未満");
            done();
            return;
          }
          const targets = ctx.targetable(ctx.opponent.youkai);
          if (!targets.length) {
            ctx.log("不発：相手の怪異がいない");
            done();
            return;
          }
          ctx.confirmYesNo("静寂", "物音を4支払いますか？（相手の怪異1枚に2ダメージ）", (yes) => {
            if (!yes) {
              done();
              return;
            }
            Game.payNoise(ctx.side, 4);
            pickOppTarget(ctx, ctx.opponent.youkai, "静寂", "2ダメージを与える怪異", done, (t) => {
              dmg(ctx, t, 2);
              done();
            });
          });
        } };
        D["CHOKOKU-019"] = { enter(ctx, done) {
          if (!hasTrait(ctx.me.field, "彫刻公園")) {
            ctx.log("不発：フィールドが〔彫刻公園〕ではない");
            done();
            return;
          }
          if (ctx.me.noise.current < 6) {
            ctx.log("不発：物音が6未満");
            done();
            return;
          }
          const opp = otherSide(ctx.side);
          const tr = ctx.state.tracking[opp];
          const cands = ctx.opponent.youkai.filter((c) => tr && tr.youkai === c);
          if (!cands.length) {
            ctx.log("不発：追跡している怪異がいない");
            done();
            return;
          }
          pickOppTarget(ctx, cands, "布を掛けられた彫刻", "追跡を解除する怪異", done, (t) => {
            Game.clearPursuitOf(t, "布を掛けられた彫刻");
            done();
          });
        } };
        D["FIELD-CHOKOKU"] = { noise(ctx, done) {
          const total = ctx.item.tierTotal;
          const band = total >= 20 ? "C" : total >= 12 ? "B" : "A";
          const table = NOISE_TABLE[band];
          ctx.log("物音効果：累計" + total + "（段" + band + "）");
          const narumi = ctx.me.humans.some((c) => nameOf(c) === "ナルミ");
          const fire = (entry) => {
            if (entry.avail && !entry.avail(ctx)) {
              ctx.log("物音：不発（対象なし）「" + entry.label + "」");
              done();
              return;
            }
            ctx.log("物音：「" + entry.label + "」");
            entry.run(ctx, done);
          };
          if (narumi) ctx.pickOption({ title: "ナルミ", message: "発動する物音効果を選んでください（累計" + total + "）", options: table.map((e) => ({ key: e.key, label: e.label })) }, (o) => {
            fire(table.find((e) => e.key === (o && o.key)) || table[0]);
          });
          else fire(table[Game._rand("noise:" + ctx.side + ":" + total, table.length)]);
        } };
        const KINDS = ["enter", "leave", "event", "endTurn", "startTurn", "lostThird", "onEquip", "hostLeft", "ownAssault", "oppAssault", "noise"];
        function def(id) {
          return D[id] || null;
        }
        const Effects = {
          definitions: D,
          hasEffect(kind, cardId) {
            const d = def(cardId);
            if (!d) return false;
            if (kind === "reaction") return !!d.react;
            return typeof d[kind] === "function";
          },
          runEffect(item, ctx, done) {
            const d = def(item.master.id);
            if (!d) {
              done();
              return;
            }
            if (item.kind === "reaction") {
              const fn2 = d.react && d.react[item.react];
              if (!fn2) throw new GD1Unsupported("reaction " + item.react + " missing on " + item.master.id);
              fn2(ctx, done);
              return;
            }
            const fn = d[item.kind];
            if (typeof fn !== "function") {
              done();
              return;
            }
            fn(ctx, done);
          },
          getStaticModifiers(target, state, opt) {
            let speed = 0, hp = 0;
            const notes = {};
            const o = opt || {};
            if (!state) return { speed, hp, notes: [] };
            ["village", "mansion"].forEach((side) => {
              const p = state.players[side];
              [p.field].concat(units(p)).forEach((src) => {
                const d = def(src.cardId);
                if (!d || !d.static) return;
                const m = d.static(src, target, state);
                if (!m) return;
                if (o.ignoreOppReduction && src.owner !== target.owner && ((m.speed || 0) < 0 || (m.hp || 0) < 0)) {
                  notes["（相手の効果による減少を無効）"] = 1;
                  return;
                }
                speed += m.speed || 0;
                hp += m.hp || 0;
                if (m.note) notes[m.note] = (notes[m.note] || 0) + 1;
              });
            });
            return { speed, hp, notes: Object.keys(notes).map((n) => notes[n] > 1 ? n + " ×" + notes[n] : n) };
          },
          goodsBonus(goods, host, state) {
            const b = goods.master.equipBonus || {};
            let speed = b.speed || 0, hp = b.hp || 0;
            const d = def(goods.cardId);
            if (d && d.goodsBonus) {
              const x = d.goodsBonus(goods, host, state);
              speed += x.speed || 0;
              hp += x.hp || 0;
            }
            const parts = [];
            if (speed) parts.push("スピード" + (speed > 0 ? "+" : "") + speed);
            if (hp) parts.push("体力" + (hp > 0 ? "+" : "") + hp);
            return { speed, hp, note: parts.length ? nameOf(goods) + "：" + parts.join("、") : null };
          },
          costModifiers(side, inst, master, state) {
            const p = state.players[side];
            let mods = [];
            const own = def(master.id);
            if (own && own.cost) mods = mods.concat(own.cost(side, inst, master, state));
            const fd = def(p.field.cardId);
            if (fd && fd.cost) mods = mods.concat(fd.cost(side, inst, master, state));
            units(p).forEach((u) => {
              const d = def(u.cardId);
              if (d && d.handCost) mods = mods.concat(d.handCost(side, inst, master, state, u));
            });
            return mods;
          },
          playRestriction(side, inst, master, state) {
            const p = state.players[side];
            const fd = def(p.field.cardId);
            if (fd && fd.playRestriction) {
              const r = fd.playRestriction(side, inst, master, state);
              if (r) return r;
            }
            return null;
          },
          pursuitRestriction(side, yk, humans, state) {
            const def_ = state.players[otherSide(side)];
            for (const u of units(def_)) {
              const d = def(u.cardId);
              if (d && d.pursuitRestriction) {
                const r = d.pursuitRestriction(side, yk, humans, state);
                if (r) return r;
              }
            }
            return null;
          },
          isImmuneToOppTargeting(card, state) {
            const d = def(card.cardId);
            if (d && d.targetImmunity) return true;
            const fd = def(state.players[card.owner].field.cardId);
            if (fd && fd.targetImmunityFor && fd.targetImmunityFor(card, state)) return true;
            return false;
          },
          assaultReduction(goods, human, state) {
            const d = def(goods.cardId);
            return d && d.assaultReduction ? d.assaultReduction(goods, human, state) : null;
          },
          isTrashLocked(side, state) {
            return units(state.players[side]).some((u) => (u.equipment || []).some((g) => {
              const d = def(g.cardId);
              return d && d.zoneLockTrash;
            }));
          },
          abilitiesOf(side, inst, state) {
            const d = def(inst.cardId);
            return d && d.abilities || [];
          },
          /* ---- engine hooks → reactions (queued to the reacting player's side; resolved after the turn player's effects, R§2) */
          _react(state, side, source, key, payload) {
            if (state.gameOver) return;
            state.pendingEffects.push(Game._mkItem("reaction", source, side, { react: key, payload }));
          },
          onCardUsed(user, inst, how, state) {
            const opp = otherSide(user);
            const O = state.players[opp], U = state.players[user];
            if (O.field.cardId === "FIELD-CHOKOKU") Game.gainNoise(opp, 1, "相手がカードを使った");
            if (how.type === "human") O.humans.forEach((c) => {
              if (nameOf(c) === "ヴィルマ") this._react(state, opp, c, "vilma", { card: inst });
            });
            if (how.type === "event") {
              O.humans.forEach((c) => {
                if (nameOf(c) === "学メ1") this._react(state, opp, c, "gakumeEvent", { card: inst });
              });
              if (U.field.cardId === "FIELD-YUEN" && hasTrait(inst, "遊園地")) this._react(state, user, U.field, "yuenDraw", { card: inst, handAtUse: U.hand.length });
              if (hasTrait(inst, "ホテル") && U.field.cardId === "FIELD-HOTEL" && !U.turnUse.hotelEvent && U.youkai.some((c) => hasKeyword(c, "【二重追跡】"))) U.turnUse.hotelEvent = 1;
            }
            if (how.type === "goods" && U.field.cardId === "FIELD-SHOTEN") this._react(state, user, U.field, "shotenGoodsUsed", { card: inst });
            if (how.type === "youkai" && how.from !== "hand") O.youkai.forEach((c) => {
              if (nameOf(c) === "大きな作品") this._react(state, opp, c, "bigWork", { card: inst });
            });
          },
          onPursuitDeclared(side, yk, humans, state) {
            const opp = otherSide(side);
            if (state.players[opp].field.cardId === "FIELD-CHOKOKU") Game.gainNoise(opp, 1, "相手が追跡を宣言した");
          },
          onUnitLeft(owner, inst, leftMaster, traits, state) {
            const p = state.players[owner];
            if (leftMaster.type === "youkai" && traits.includes("学校") && p.field.cardId === "FIELD-GAKKO") this._react(state, owner, p.field, "gakkoLeave", { card: inst });
          },
          onHandDiscard(side, cards, state) {
            const opp = otherSide(side);
            state.players[opp].humans.forEach((c) => {
              if (nameOf(c) === "街人3") this._react(state, opp, c, "yoruDiscard", { cards });
            });
          },
          onAssaultResolved(side, info, humansLost, state) {
            const A = state.players[side], Dp = state.players[otherSide(side)];
            if (info.attacker && A.youkai.indexOf(info.attacker) !== -1) {
              [info.attacker].concat(info.attacker.equipment || []).forEach((c) => {
                if (this.hasEffect("ownAssault", c.cardId)) state.pendingEffects.push(Game._mkItem("ownAssault", c, side, { humansLost: humansLost.length, attacker: info.attacker }));
              });
            }
            units(Dp).forEach((c) => {
              if (this.hasEffect("oppAssault", c.cardId)) state.pendingEffects.push(Game._mkItem("oppAssault", c, otherSide(side), { info }));
            });
          },
          NOISE_TABLE
        };
        return Effects;
      }
      module.exports = { createEffects };
    }
  });

  // src/engine/engine-gd1.js
  var require_engine_gd1 = __commonJS({
    "src/engine/engine-gd1.js"(exports, module) {
      "use strict";
      var ENERGY_MAX = 10;
      var MAX_HUMANS = 3;
      var MAX_YOUKAI = 3;
      var HAND_LIMIT = 10;
      var NOISE_STEP = 4;
      var GD1Unsupported = class extends Error {
        constructor(msg, info) {
          super("GD1-UNSUPPORTED: " + msg);
          this.info = info || null;
        }
      };
      function otherSide(side) {
        return side === "village" ? "mansion" : "village";
      }
      function createGd1Engine(deps) {
        const CARD_MASTER = deps.CARD_MASTER;
        const DECKS = deps.DECKS;
        const createRng = deps.createRng;
        const GameEvents = deps.GameEvents || null;
        const GAME_EVENT = deps.GAME_EVENT || {};
        function hasTrait(inst, trait) {
          const t = inst && inst.master && inst.master.traits || [];
          return t.indexOf(trait) !== -1;
        }
        function countTrait(cards, trait) {
          let n = 0;
          for (const c of cards) if (hasTrait(c, trait)) n++;
          return n;
        }
        function isUnit(inst) {
          const t = inst.master.type;
          return t === "human" || t === "youkai";
        }
        function hasKeyword(inst, kw) {
          return String(inst.master.effect || "").indexOf(kw) !== -1;
        }
        function nameOf(inst) {
          return inst.master.name;
        }
        function firstFaceMaster(inst) {
          return inst.faces ? CARD_MASTER[inst.faces[0]] : inst.master;
        }
        function originalCost(inst) {
          const m = inst.master;
          if (m.originalCostFrom) return Number(CARD_MASTER[m.originalCostFrom].cost) || 0;
          return typeof m.cost === "number" ? m.cost : 0;
        }
        let _uidCounter = 0;
        function createInstance(cardId, owner) {
          const master = CARD_MASTER[cardId];
          if (!master) throw new GD1Unsupported("unknown card id " + cardId);
          const inst = {
            uid: ++_uidCounter,
            cardId: master.id,
            owner,
            master,
            accumulatedDamage: 0,
            equippedGoods: null,
            equipment: [],
            equippedTo: null,
            tracking: false,
            enteredTurn: -1,
            faceIndex: 0
          };
          if (master.faces) inst.faces = master.faces.slice();
          return inst;
        }
        const RuntimeDecks = {
          custom: {},
          set(id, def) {
            this.custom[id] = def;
          },
          clear() {
            this.custom = {};
          },
          get(id) {
            return DECKS[id] || this.custom[id] || null;
          }
        };
        function deckDefOf(id) {
          return RuntimeDecks.get(id);
        }
        function buildPlayerState(side, deckId, seatLabel, rng, log) {
          const def = deckDefOf(deckId);
          if (!def) throw new GD1Unsupported("unknown deck " + deckId);
          const all = [];
          def.mainDeck.forEach((e) => {
            for (let i = 0; i < e.count; i++) all.push(createInstance(e.id, side));
          });
          const initIndex = all.findIndex((c) => c.cardId === def.initialHuman);
          if (initIndex < 0) throw new GD1Unsupported("deck has no initial human " + deckId);
          const initialHuman = all.splice(initIndex, 1)[0];
          initialHuman.enteredTurn = 0;
          const field = createInstance(def.fieldId, side);
          rng.shuffle(all);
          log.push("シャッフル：" + seatLabel + " 山札" + all.length + "枚");
          const hand = [];
          for (let i = 0; i < 5; i++) hand.push(all.shift());
          log.push("初期ドロー：" + seatLabel + " " + hand.length + "枚");
          return {
            side,
            deckId,
            label: seatLabel,
            deck: all,
            hand,
            field,
            humans: [initialHuman],
            youkai: [],
            lost: [],
            trash: [],
            exile: [],
            energy: 0,
            noise: { current: 0, gained: 0 },
            instantLoss: null,
            turnUse: { goods: 0, chika: 0, eventsByName: {} }
          };
        }
        const Game = {
          state: null,
          hiddenSide: null,
          decisionProviders: { village: null, mansion: null },
          // side → uiOps factory(item) (see setDecisionProvider)
          Unsupported: GD1Unsupported,
          emit(name, data) {
            if (GameEvents && GameEvents.emit) GameEvents.emit(name, data);
          },
          isHidden(side) {
            return this.hiddenSide === side;
          },
          logHidden(side, open, masked) {
            this.state.log.push(this.isHidden(side) ? masked : open);
          },
          deckOf(side) {
            const st = this.state;
            return deckDefOf(st && st.decks ? st.decks[side] : side);
          },
          labelOf(side) {
            const st = this.state;
            return st && st.labels && st.labels[side] || side;
          },
          otherSide,
          /** decision providers: uiOps for a side, used when an effect needs THAT side's choice (incl. the opponent's choice) */
          setDecisionProvider(side, factory) {
            this.decisionProviders[side] = factory;
          },
          _opsFor(side, item) {
            const sp = this.state && this.state.__simProviders;
            if (sp) {
              const r = sp(side, item);
              if (r) return r;
            }
            const f = this.decisionProviders[side];
            if (!f) throw new GD1Unsupported("no decision provider for " + side + " (needed by " + (item && item.source ? item.source.cardId : "?") + ")");
            const ops = f(item);
            const snap = this._itemSnapshot;
            if (snap && snap.item === item && !this.state.__simProviders) return this._journalingOps(ops, side, snap.made[side]);
            return ops;
          },
          _journalingOps(ops, side, journal) {
            const rec = (kind, v) => {
              journal.push({ kind, v });
            };
            const uids = (cards) => (cards || []).map((c) => c && c.uid);
            return {
              showCards: ops.showCards || null,
              confirmYesNo(title, message, cb) {
                ops.confirmYesNo(title, message, (v) => {
                  rec("confirm", !!v);
                  cb(v);
                });
              },
              pickCards(options, cb) {
                ops.pickCards(options, (v) => {
                  rec("pick", uids(v));
                  cb(v);
                });
              },
              pickBoardTarget(options, cb) {
                ops.pickBoardTarget(options, (v) => {
                  rec("target", v ? v.uid : null);
                  cb(v);
                });
              },
              pickOption: ops.pickOption ? function(options, cb) {
                ops.pickOption(options, (v) => {
                  rec("option", v ? v.key != null ? v.key : (options.options || []).indexOf(v) : null);
                  cb(v);
                });
              } : void 0,
              pickOrder: ops.pickOrder ? function(options, cb) {
                ops.pickOrder(options, (v) => {
                  rec("order", (v || []).map((x) => x && x.uid != null ? { uid: x.uid } : { i: (options.items || []).indexOf(x) }));
                  cb(v);
                });
              } : void 0
            };
          },
          /** generic decision lookahead support (v1.1 ruling A): a snapshotter (state → clone) registered by an AI makes the engine keep a
              pre-item snapshot + decision journal for the item currently being resolved (real state only; never inside simulations). */
          setDecisionSnapshotter(fn) {
            this._decisionSnapshotter = fn || null;
          },
          _itemSnapshot: null,
          _decisionSnapshotter: null,
          start(firstSide, seedInput, options) {
            let seed = (seedInput == null ? "" : String(seedInput)).trim();
            if (seed === "") seed = "gd1-" + Date.now();
            const opt = options || {};
            const decks = { village: opt.decks && opt.decks.village || "gd1-mura", mansion: opt.decks && opt.decks.mansion || "gd1-yakata" };
            const labels = { village: opt.labels && opt.labels.village || deckDefOf(decks.village).label, mansion: opt.labels && opt.labels.mansion || deckDefOf(decks.mansion).label };
            const rng = createRng(seed);
            _uidCounter = 0;
            const log = ["シード：" + seed, "先攻：" + labels[firstSide]];
            const secondSide = otherSide(firstSide);
            const players = {};
            players[firstSide] = buildPlayerState(firstSide, decks[firstSide], labels[firstSide], rng, log);
            players[secondSide] = buildPlayerState(secondSide, decks[secondSide], labels[secondSide], rng, log);
            this.state = {
              definition: "gd1-v1.1-pkg",
              seed,
              rng,
              firstSide,
              secondSide,
              decks,
              labels,
              players,
              log,
              turnCount: 0,
              sideTurnCount: { village: 0, mansion: 0 },
              currentSide: null,
              phase: "setup",
              tracking: { village: null, mansion: null },
              gameOver: null,
              pendingEffects: [],
              effectUsed: {},
              tempEffects: [],
              // duration effects (R§15)
              privateInfo: { village: [], mansion: [] },
              // hand looks etc. (R§7): only the viewer knows
              replay: [],
              // random outcomes, for determinism audit
              effectFired: {},
              // coverage: cardId:kind → count
              lastAssault: null,
              seq: 0
            };
            this.emit(GAME_EVENT.GAME_STARTED, { seed, firstSide, decks, labels });
            return this.state;
          },
          _rand(label, n) {
            const v = this.state.rng.int(n);
            this.state.replay.push(label + ":" + v);
            return v;
          },
          _shuffle(label, arr) {
            this.state.rng.shuffle(arr);
            this.state.replay.push(label + ":shuffle" + arr.length);
            return arr;
          },
          /* ---------------------------------------------------------------- mulligan (production semantics; R is silent) */
          confirmMulligan(side, selectedUids) {
            const st = this.state, p = st.players[side];
            const selected = p.hand.filter((c) => selectedUids.indexOf(c.uid) !== -1);
            const kept = p.hand.filter((c) => selectedUids.indexOf(c.uid) === -1);
            const count = selected.length;
            if (count > 0) {
              p.hand = kept;
              p.deck = p.deck.concat(selected);
              this._shuffle("mulligan:" + side, p.deck);
              for (let i = 0; i < count; i++) {
                const c = p.deck.shift();
                p.hand.push(c);
              }
              st.log.push("マリガン：" + p.label + " " + count + "枚交換");
            } else st.log.push("マリガン：" + p.label + " 0枚交換");
            this.emit(GAME_EVENT.MULLIGAN_COMPLETED, { side, count });
            return count;
          },
          /* ---------------------------------------------------------------- hand / draw (R§7) */
          drawOne(side, label) {
            const st = this.state, p = st.players[side];
            if (p.deck.length === 0) {
              this.checkVictory("ドロー中");
              return null;
            }
            const card = p.deck.shift();
            this._addToHand(side, [card], label || "ドロー");
            if (p.deck.length === 0) {
              st.log.push("山札が0枚になりました：" + p.label);
              this.checkVictory("ドロー中");
            }
            return card;
          },
          /** add cards to hand honouring the limit; overflow among simultaneously added cards is the owner's choice (R§7) */
          _addToHand(side, cards, label, reveal) {
            const st = this.state, p = st.players[side];
            const room = Math.max(0, HAND_LIMIT - p.hand.length);
            let keep = cards, over = [];
            if (cards.length > room) {
              if (room === 0 || cards.length === 1) {
                keep = [];
                over = cards.slice();
              } else {
                const ops = this._opsFor(side, { source: p.field, kind: "handLimit" });
                let chosen = null;
                ops.pickCards({ title: "手札上限", message: "手札に残すカードを" + room + "枚選んでください（残りはトラッシュ）", cards: cards.slice(), count: room, mode: "exact" }, (r) => {
                  chosen = r;
                });
                if (!chosen) throw new GD1Unsupported("handLimit decision did not complete");
                keep = chosen.slice();
                over = cards.filter((c) => keep.indexOf(c) === -1);
              }
            }
            keep.forEach((c) => {
              this._resetOffField(c);
              p.hand.push(c);
              this._logCard(side, (label || "ドロー") + "：" + p.label + " " + nameOf(c), (label || "ドロー") + "：" + p.label + " 1枚", reveal);
              this.emit(GAME_EVENT.CARD_DRAWN, { side, card: c, label });
            });
            over.forEach((c) => {
              this._resetOffField(c);
              p.trash.push(c);
              st.log.push("手札上限のため、《" + nameOf(c) + "》はトラッシュへ");
            });
            return keep.length;
          },
          _logCard(side, open, masked, reveal) {
            if (reveal) this.state.log.push(open + "（公開）");
            else this.logHidden(side, open, masked);
          },
          isHandFull(side) {
            return this.state.players[side].hand.length >= HAND_LIMIT;
          },
          /** legacy name kept for the AI stack */
          _addFromDeckToHand(side, card, label, reveal) {
            return this._addToHand(side, [card], label, reveal) === 1;
          },
          /** discard from hand chosen by the owner or by an effect; kind: 'self'|'random'|'looker' (R§7) */
          discardFromHand(side, insts, cause) {
            const st = this.state, p = st.players[side];
            const moved = [];
            insts.forEach((inst) => {
              const i = p.hand.indexOf(inst);
              if (i === -1) return;
              p.hand.splice(i, 1);
              this._resetOffField(inst);
              p.trash.push(inst);
              moved.push(inst);
              st.log.push("トラッシュへ：" + p.label + " " + nameOf(inst) + "（手札から" + (cause ? "・" + cause : "") + "）");
            });
            if (moved.length) this._onHandDiscard(side, moved);
            return moved;
          },
          discardRandomFromHand(side, n, cause) {
            const p = this.state.players[side];
            const chosen = [];
            const pool = p.hand.slice();
            for (let i = 0; i < n && pool.length; i++) {
              const k = this._rand("discardRandom:" + side, pool.length);
              chosen.push(pool.splice(k, 1)[0]);
            }
            return this.discardFromHand(side, chosen, cause || "ランダム");
          },
          /* ---------------------------------------------------------------- energy (R§3) */
          gainEnergy(side) {
            const st = this.state, p = st.players[side];
            const nth = st.sideTurnCount[side];
            let gain = side === st.firstSide && nth === 1 ? 1 : 2;
            const opp = st.players[otherSide(side)];
            if (opp.youkai.some((c) => hasKeyword(c, "相手のターン開始時に回復する気力を-1する"))) gain = Math.max(0, gain - 1);
            const before = p.energy;
            p.energy = Math.min(ENERGY_MAX, before + gain);
            st.log.push("気力：" + p.label + " +" + gain + " → " + p.energy);
            this.emit(GAME_EVENT.MORALE_CHANGED, { side, before, after: p.energy, gain, reason: "turnStart" });
            return { gain, energy: p.energy };
          },
          recoverEnergy(side, n, why) {
            const p = this.state.players[side];
            const before = p.energy;
            p.energy = Math.min(ENERGY_MAX, p.energy + n);
            this.state.log.push("気力回復：" + p.label + " " + before + " → " + p.energy + (why ? "（" + why + "）" : ""));
          },
          /* ---------------------------------------------------------------- turn flow (R§1)
             driver order: beginTurn → assault (prepareAttack/applyAttackDamage/finishAttack) → queueStartTurnEffects + resolve
                           → turnStartResources → main (endMain) → queueEndTurnEffects + resolve → tracking (setTracking/skipTracking)
                           → toEndPhase → endTurn */
          beginTurn(side) {
            const st = this.state;
            st.turnCount += 1;
            st.sideTurnCount[side] += 1;
            st.currentSide = side;
            st.phase = "assault";
            const p = st.players[side];
            p.turnUse = { goods: 0, chika: 0, eventsByName: {} };
            st.log.push("── ターン" + st.turnCount + "｜" + this.labelOf(side) + " 第" + st.sideTurnCount[side] + "ターン 開始");
            this._expireEffects("turnStart", side);
            this.recalcAndResolveDeaths("ターン開始（持続効果の終了）");
            this.emit(GAME_EVENT.TURN_STARTED, { side, turnCount: st.turnCount });
            return st;
          },
          /** after the assault: 【自分のターン開始時】 effects go to the queue (R§1: 開始時 is after the assault) */
          queueStartTurnEffects(side) {
            const st = this.state;
            if (st.gameOver) return;
            this._expireEffects("beforeStartEffects", side);
            this.recalcAndResolveDeaths("ターン開始（持続効果の終了）");
            if (st.gameOver) return;
            st.phase = "start";
            const p = st.players[side];
            this.queueEffect("startTurn", p.field);
            p.humans.concat(p.youkai).forEach((c) => this.queueEffect("startTurn", c));
          },
          turnStartResources(side) {
            if (this.state.gameOver) return;
            this.gainEnergy(side);
            this.drawOne(side);
            this.state.phase = "main";
            this.emit(GAME_EVENT.PHASE_CHANGED, { side, phase: "main" });
          },
          endMain() {
            const st = this.state;
            st.log.push("メイン終了：" + this.labelOf(st.currentSide));
            st.phase = "endEffects";
            return st.phase;
          },
          backToMain() {
            this.state.phase = "main";
          },
          queueEndTurnEffects(side) {
            const st = this.state;
            if (st.gameOver) return;
            const p = st.players[side];
            this.queueEffect("endTurn", p.field);
            p.humans.concat(p.youkai).forEach((c) => this.queueEffect("endTurn", c));
          },
          /** move to the pursuit declaration step (after end-of-turn effects, R§1) */
          toTrackingPhase() {
            const st = this.state;
            const me = st.players[st.currentSide], opp = st.players[otherSide(st.currentSide)];
            const canTrack = me.youkai.length > 0 && opp.humans.length > 0;
            st.phase = canTrack ? "tracking" : "end";
            if (!canTrack) st.log.push("追跡選択：対象がいないため省略");
            return st.phase;
          },
          toEndPhase() {
            this.state.phase = "end";
          },
          endTurn() {
            const st = this.state;
            st.log.push("ターン終了：" + this.labelOf(st.currentSide));
            this._expireEffects("turnEnd", st.currentSide);
            this.recalcAndResolveDeaths("ターン終了（持続効果の終了）");
            const next = otherSide(st.currentSide);
            st.phase = "setup";
            return next;
          },
          /* ---------------------------------------------------------------- stats (R§15 pumps, static effects) */
          getStats(inst) {
            const m = inst.master;
            const baseSpeed = typeof m.speed === "number" ? m.speed : null;
            const baseHp = typeof m.hp === "number" ? m.hp : null;
            if (baseSpeed === null || baseHp === null) return { hasStats: false, corrections: [] };
            let speedBonus = 0, hpBonus = 0;
            const corrections = [];
            const immune = hasKeyword(inst, "相手の効果によって下がらない");
            const mods = Effects.getStaticModifiers(inst, this.state, { ignoreOppReduction: immune });
            speedBonus += mods.speed;
            hpBonus += mods.hp;
            mods.notes.forEach((n) => corrections.push(n));
            (inst.equipment || []).forEach((g) => {
              const b = Effects.goodsBonus(g, inst, this.state);
              speedBonus += b.speed;
              hpBonus += b.hp;
              if (b.note) corrections.push(b.note);
            });
            for (const e of this.state.tempEffects) {
              if (e.kind !== "stat") continue;
              if (!this._tempTargets(e, inst)) continue;
              const sp = e.speed || 0, hp = e.hp || 0;
              if (immune && e.owner !== inst.owner && (sp < 0 || hp < 0)) {
                corrections.push("（相手の効果による減少を無効）");
                continue;
              }
              speedBonus += sp;
              hpBonus += hp;
              corrections.push(e.note || "duration");
            }
            const curSpeed = Math.max(0, baseSpeed + speedBonus);
            const maxHp = baseHp + hpBonus;
            return { hasStats: true, baseSpeed, baseHp, curSpeed, maxHp, curHp: maxHp - inst.accumulatedDamage, accum: inst.accumulatedDamage, corrections, equip: inst.equippedGoods, tracking: inst.tracking };
          },
          /** declarative duration-effect targeting (cloneable / snapshot-able): target = {uid} | {owner, types?, trait?, name?} */
          _tempTargets(e, inst) {
            const t = e.target;
            if (!t) return false;
            if (t.uid != null) return t.uid === inst.uid;
            if (t.owner && t.owner !== inst.owner) return false;
            if (t.types && t.types.indexOf(inst.master.type) === -1) return false;
            if (t.trait && !hasTrait(inst, t.trait)) return false;
            if (t.name && nameOf(inst) !== t.name) return false;
            return true;
          },
          /* ---------------------------------------------------------------- duration effects (R§15) */
          /** expiry keys: 'ownAssaultEnd' (my next assault finished), 'oppAssaultEnd' (opponent's assault finished),
              'beforeStartEffects' (opponent turn began without assault → 次の相手の襲撃時 ends), 'turnStart'(side), 'turnEnd'(side) */
          addTempEffect(e) {
            e.id = ++this.state.seq;
            this.state.tempEffects.push(e);
            return e;
          },
          _expireEffects(event, side) {
            const st = this.state;
            if (!st.tempEffects.length) return;
            st.tempEffects = st.tempEffects.filter((e) => {
              const x = e.until;
              if (x.type === "ownAssault" && event === "ownAssaultEnd" && side === e.owner) return false;
              if (x.type === "oppAssault" && event === "oppAssaultEnd" && side === otherSide(e.owner)) return false;
              if (x.type === "oppAssault" && event === "beforeStartEffects" && side === otherSide(e.owner)) return false;
              if (x.type === "myNextTurnStart" && event === "turnStart" && side === e.owner) return false;
              if (x.type === "oppTurnEnd" && event === "turnEnd" && side === otherSide(e.owner)) return false;
              if (x.type === "oppNextTurnEnd" && event === "turnEnd" && side === otherSide(e.owner) && st.turnCount > x.setTurn) return false;
              if (x.type === "thisTurn" && event === "turnEnd") return false;
              return true;
            });
          },
          /* ---------------------------------------------------------------- goods targets / equipment (R§9) */
          getGoodsTargets(side, goodsInst) {
            const p = this.state.players[side];
            const rule = goodsInst.master.equipTarget;
            if (!rule) return [];
            let pool = rule.type === "human" ? p.humans : rule.type === "youkai" ? p.youkai : p.humans.concat(p.youkai);
            return pool.filter((c) => {
              if (rule.trait && !hasTrait(c, rule.trait)) return false;
              if (rule.name && nameOf(c) !== rule.name) return false;
              return this._canEquipMore(c, goodsInst);
            });
          },
          _canEquipMore(host, goods) {
            if (!host.equipment.length) return true;
            const m = String(host.master.effect || "").match(/名前の異なる特徴〔([^〕]+)〕を持つグッズを何枚でも装備できる/);
            if (!m) return false;
            if (!hasTrait(goods, m[1])) return false;
            return !host.equipment.some((g) => nameOf(g) === nameOf(goods));
          },
          _attachGoods(host, goods, how) {
            host.equipment.push(goods);
            host.equippedGoods = host.equipment[0];
            goods.equippedTo = host;
            this.state.log.push("装備：" + this.labelOf(host.owner) + " " + nameOf(goods) + " → " + nameOf(host) + (how ? "（" + how + "）" : ""));
            this.emit(GAME_EVENT.CARD_EQUIPPED, { side: host.owner, goods, target: host });
            this.queueEffect("onEquip", goods);
          },
          _detachGoods(host, goods) {
            const i = host.equipment.indexOf(goods);
            if (i !== -1) host.equipment.splice(i, 1);
            host.equippedGoods = host.equipment[0] || null;
            goods.equippedTo = null;
          },
          /* ---------------------------------------------------------------- cost (R§4) */
          /** cost a player must pay now to use `inst` (face = face index to play as, default current/first) */
          effectiveCost(side, inst, faceIndex) {
            const m = faceIndex != null && inst.faces ? CARD_MASTER[inst.faces[faceIndex]] : inst.master;
            const printed = typeof m.cost === "number" ? m.cost : 0;
            const mods = Effects.costModifiers(side, inst, m, this.state);
            let cost = printed;
            for (const x of mods) if (x.fix != null) cost = x.fix;
            for (const x of mods) if (x.delta) cost += x.delta;
            let floor = 0;
            for (const x of mods) if (x.floor != null) floor = Math.max(floor, x.floor);
            return Math.max(floor, cost);
          },
          /* ---------------------------------------------------------------- play legality (R§11, R§13, field restrictions) */
          canPlay(side, inst, opts) {
            const st = this.state, p = st.players[side];
            const o = opts || {};
            const reasons = [];
            if (p.hand.indexOf(inst) === -1) return { ok: false, reasons: ["そのカードは手札にありません。"] };
            const face = o.face || 0;
            const m = face && inst.faces ? CARD_MASTER[inst.faces[face]] : firstFaceMaster(inst);
            if (face) {
              const allowed = inst.master.directPlayFaces || [];
              if (allowed.indexOf(face) === -1) return { ok: false, reasons: ["その面では手札から出せません。"] };
            }
            if (m.growth) return { ok: false, reasons: ["【成長】面は手札から出せません。"] };
            const cost = this.effectiveCost(side, inst, face);
            if (!o.free && p.energy < cost) reasons.push("気力が" + (cost - p.energy) + "足りません。");
            if (m.type === "human" && p.humans.length >= MAX_HUMANS) reasons.push("人間エリアが上限のため、これ以上登場できません。");
            if (m.type === "youkai" && p.youkai.length >= MAX_YOUKAI) reasons.push("怪異エリアが上限のため、これ以上登場できません。");
            if (m.type === "goods" && this.getGoodsTargets(side, inst).length === 0) reasons.push("装備できる対象がいません。");
            if (m.type === "event" && m.oncePerTurnName && p.turnUse.eventsByName[m.name]) reasons.push("【1ターン1枚】このターンは同名のイベントを使用済みです。");
            const r = Effects.playRestriction(side, inst, m, st);
            if (r) reasons.push(r);
            return { ok: reasons.length === 0, reasons };
          },
          canLegallyPlayCard(side, inst) {
            return this.canPlay(side, inst).ok;
          },
          wouldResolveMeaningfully() {
            return true;
          },
          hasMeaningfulPlay(side) {
            return this.state.players[side].hand.some((c) => this.canPlay(side, c).ok);
          },
          _pay(side, cost) {
            const p = this.state.players[side];
            p.energy -= cost;
            return cost;
          },
          _removeFromHand(side, inst) {
            const p = this.state.players[side];
            const i = p.hand.indexOf(inst);
            if (i !== -1) p.hand.splice(i, 1);
          },
          /** "カードを使った" hook (R§16): user = the card's owner (the player who put it on the field), never the effect controller */
          _onCardUsed(user, inst, how) {
            const st = this.state;
            this.emit(GAME_EVENT.CARD_PLAYED, { side: user, card: inst, how });
            Effects.onCardUsed(user, inst, how, st);
          },
          /* ---------------------------------------------------------------- playing cards (R§11, R§16) */
          /** opts: {face, free, byEffect, controller, from:'hand'|'trash'|'lost'} */
          playUnit(side, inst, opts) {
            const st = this.state, p = st.players[side];
            const o = opts || {};
            const check = this.canPlay(side, inst, o);
            if (!check.ok) return { ok: false, reasons: check.reasons };
            const face = o.face || 0;
            const cost = o.free ? 0 : this._pay(side, this.effectiveCost(side, inst, face));
            this._removeFromHand(side, inst);
            this._placeUnit(side, inst, face, o.free ? "コストを支払わず" : "気力" + cost + "消費 → 残り" + p.energy, "hand");
            return { ok: true, cost };
          },
          /** put a unit onto the field from any zone (already removed from its zone by the caller) */
          _placeUnit(side, inst, face, how, from) {
            const st = this.state, p = st.players[side];
            if (inst.faces) {
              inst.faceIndex = face || 0;
              inst.master = CARD_MASTER[inst.faces[inst.faceIndex]];
              inst.cardId = inst.master.id;
            }
            inst.accumulatedDamage = 0;
            inst.tracking = false;
            inst.equipment = [];
            inst.equippedGoods = null;
            inst.enteredTurn = st.turnCount;
            if (inst.master.type === "human") p.humans.push(inst);
            else p.youkai.push(inst);
            st.log.push("登場：" + p.label + " " + nameOf(inst) + "（" + how + "）");
            this._noteUse(side, inst);
            this.recalcAndResolveDeaths("登場時");
            if (st.gameOver) return;
            this.queueEnterEffect(inst);
            this._onCardUsed(side, inst, { type: inst.master.type, from: from || "hand" });
          },
          _noteUse(side, inst) {
            const p = this.state.players[side];
            if (inst.master.type === "goods") p.turnUse.goods++;
            if (hasTrait(inst, "地下")) p.turnUse.chika++;
          },
          playGoods(side, goodsInst, targetInst, opts) {
            const st = this.state, p = st.players[side];
            const o = opts || {};
            const check = this.canPlay(side, goodsInst, o);
            if (!check.ok) return { ok: false, reasons: check.reasons };
            if (this.getGoodsTargets(side, goodsInst).indexOf(targetInst) === -1) return { ok: false, reasons: ["そのカードには装備できません。"] };
            const cost = o.free ? 0 : this._pay(side, this.effectiveCost(side, goodsInst));
            this._removeFromHand(side, goodsInst);
            this._noteUse(side, goodsInst);
            this._attachGoods(targetInst, goodsInst, "気力" + cost + "消費 → 残り" + p.energy);
            this._onCardUsed(side, goodsInst, { type: "goods", from: "hand" });
            this.recalcAndResolveDeaths("装備時");
            return { ok: true, cost };
          },
          /** equip from the trash by effect (切り札): no cost, 【装備時】 fires (R§9) */
          equipFromTrash(side, goods, host) {
            const p = this.state.players[side];
            const i = p.trash.indexOf(goods);
            if (i === -1) return false;
            p.trash.splice(i, 1);
            this._resetOffField(goods);
            this._noteUse(side, goods);
            this._attachGoods(host, goods, "トラッシュから／効果");
            this._onCardUsed(side, goods, { type: "goods", from: "trash", byEffect: true });
            return true;
          },
          playEvent(side, inst, opts) {
            const st = this.state, p = st.players[side];
            const o = opts || {};
            const check = this.canPlay(side, inst, o);
            if (!check.ok) return { ok: false, reasons: check.reasons };
            const cost = o.free ? 0 : this._pay(side, this.effectiveCost(side, inst));
            this._removeFromHand(side, inst);
            this._useEvent(side, inst, { from: "hand", cost, after: "trash" });
            return { ok: true, cost };
          },
          /** shared event-use pipeline (hand / trash). after: 'trash' | 'stay' | 'exile' */
          _useEvent(side, inst, o) {
            const st = this.state, p = st.players[side];
            if (inst.master.oncePerTurnName && !o.ignoreOnce) p.turnUse.eventsByName[nameOf(inst)] = true;
            if (hasTrait(inst, "地下")) p.turnUse.chika++;
            st.log.push("使用：" + p.label + " " + nameOf(inst) + (o.from === "trash" ? "（トラッシュから／コストなし）" : "（気力" + o.cost + "消費 → 残り" + p.energy + "）"));
            this.emit(GAME_EVENT.EVENT_USED, { side, card: inst, cost: o.cost || 0 });
            st.pendingEffects.push(this._mkItem("event", inst, side, { after: o.after, from: o.from, fixedOrder: !!o.fixedOrder }));
            this._onCardUsed(side, inst, { type: "event", from: o.from });
          },
          /* ---------------------------------------------------------------- victory / loss (R§2, R§6) */
          checkVictory(phaseLabel) {
            const st = this.state;
            if (!st || st.gameOver) return st ? st.gameOver : null;
            const losers = [];
            ["village", "mansion"].forEach((side) => {
              const p = st.players[side];
              const reasons = [];
              const limit = p.field.master.lostLimit;
              if (typeof limit === "number" && p.lost.length >= limit) reasons.push("ロスト上限到達");
              if (p.humans.length === 0) reasons.push("場の人間が0体");
              if (p.deck.length === 0) reasons.push("山札が0枚");
              if (p.instantLoss) reasons.push("即敗北：" + p.instantLoss);
              if (reasons.length) losers.push({ side, reasons });
            });
            if (!losers.length) return null;
            let loser = losers[0];
            if (losers.length === 2) loser = losers.find((l) => l.side === st.currentSide) || losers[0];
            const winner = otherSide(loser.side);
            const result = { draw: false, winner, losers, phaseLabel, simultaneous: losers.length === 2, turnCount: st.turnCount, round: Math.ceil(st.turnCount / 2), currentSide: st.currentSide, sideTurn: st.currentSide ? st.sideTurnCount[st.currentSide] : 0 };
            st.log.push("決着：" + this.labelOf(winner) + "の勝利（" + this.labelOf(loser.side) + "の敗北理由：" + loser.reasons.join("／") + (losers.length === 2 ? "、同時敗北→手番側が先に敗北" : "") + "）");
            st.gameOver = result;
            st.pendingEffects = [];
            this.emit(GAME_EVENT.GAME_ENDED, { result });
            return result;
          },
          /* ---------------------------------------------------------------- zones (R§8) */
          _resetOffField(inst) {
            inst.accumulatedDamage = 0;
            inst.tracking = false;
            inst.equipment = [];
            inst.equippedGoods = null;
            inst.equippedTo = null;
            inst.enteredTurn = -1;
            if (inst.faces) {
              inst.faceIndex = 0;
              inst.master = CARD_MASTER[inst.faces[0]];
              inst.cardId = inst.master.id;
            }
          },
          /** move a unit from the field: humans → lost, youkai → trash (or a given destination). Handles goods, tracking, triggers. */
          _leaveField(inst, dest, why) {
            const st = this.state, p = st.players[inst.owner];
            const zone = inst.master.type === "human" ? p.humans : p.youkai;
            const i = zone.indexOf(inst);
            if (i !== -1) zone.splice(i, 1);
            const goods = inst.equipment.slice();
            const wasYoukaiTraits = inst.master.traits.slice();
            const leftMaster = inst.master;
            const destination = dest || (inst.master.type === "human" ? "lost" : "trash");
            let goodsToHand = [];
            if (goods.length && hasKeyword(inst, "グッズを、トラッシュに置くかわりに自分の手札に加えることができる")) {
              const ops = this._opsFor(inst.owner, { source: inst, kind: "replacement" });
              let yes = null;
              ops.confirmYesNo(nameOf(inst), "装備していたグッズをトラッシュに置くかわりに手札に加えますか？", (v) => {
                yes = v;
              });
              if (yes) goodsToHand = goods.slice();
            }
            inst.equipment = [];
            inst.equippedGoods = null;
            inst.tracking = false;
            inst.accumulatedDamage = 0;
            this._clearTrackingWith(inst);
            if (destination === "lost") this._toLost(inst, why);
            else if (destination === "hand") {
              this._resetOffField(inst);
              this._addToHand(inst.owner, [inst], "手札に戻す");
            } else if (destination === "exile") {
              this._resetOffField(inst);
              p.exile.push(inst);
              st.log.push("除外：" + p.label + " " + nameOf(inst));
            } else {
              this._resetOffField(inst);
              p.trash.push(inst);
              st.log.push("移動：" + p.label + " " + nameOf(inst) + " → トラッシュ" + (why ? "（" + why + "）" : ""));
            }
            goods.forEach((g) => {
              g.equippedTo = null;
              if (goodsToHand.indexOf(g) !== -1) {
                this._addToHand(inst.owner, [g], "手札に加える（置換）");
              } else {
                p.trash.push(g);
                st.log.push("移動：" + p.label + " " + nameOf(g) + "（装備）→ トラッシュ");
              }
              this.queueEffect("hostLeft", g, { host: inst });
              this.queueEffect("leave", g);
            });
            this.queueEffect("leave", inst, { master: leftMaster });
            Effects.onUnitLeft(inst.owner, inst, leftMaster, wasYoukaiTraits, st);
            this.checkVictory(why || "場を離れた");
          },
          _toLost(inst, why) {
            const st = this.state, p = st.players[inst.owner];
            this._resetOffField(inst);
            p.lost.push(inst);
            st.log.push("移動：" + p.label + " " + nameOf(inst) + " → ロスト（" + p.lost.length + "枚）" + (why ? "（" + why + "）" : ""));
            if (hasKeyword(inst, "このカードがロストゾーンに置かれた時、自分はゲームに敗北する")) p.instantLoss = nameOf(inst) + "がロストゾーンに置かれた";
            if (p.lost.length === 3) this.queueEffect("lostThird", p.field);
            this.checkVictory(why || "ロスト");
          },
          /** generic lost-zone movement is limited to original cost ≥1 unless named (R§8, manifest §4.1) */
          canLeaveLostByGenericEffect(inst) {
            return originalCost(inst) >= 1;
          },
          _clearTrackingWith(inst) {
            const st = this.state;
            ["village", "mansion"].forEach((side) => {
              const t = st.tracking[side];
              if (!t) return;
              if (t.youkai === inst) {
                t.humans.forEach((h) => {
                  h.tracking = false;
                });
                st.tracking[side] = null;
                st.log.push("追跡解除：" + this.labelOf(side) + "（怪異が場を離れた）");
                return;
              }
              const j = t.humans.indexOf(inst);
              if (j !== -1) {
                t.humans.splice(j, 1);
                t.human = t.humans[0] || null;
                if (!t.humans.length) {
                  t.youkai.tracking = false;
                  st.tracking[side] = null;
                  st.log.push("追跡解除：" + this.labelOf(side) + "（追跡先が場を離れた）");
                }
              }
            });
          },
          trashTopOfDeck(side, n) {
            const st = this.state, p = st.players[side];
            const moved = [];
            for (let i = 0; i < n; i++) {
              if (!p.deck.length) break;
              const c = p.deck.shift();
              p.trash.push(c);
              moved.push(c);
              st.log.push("トラッシュへ：" + p.label + " " + nameOf(c) + "（山札から）");
              if (!p.deck.length) {
                st.log.push("山札が0枚になりました：" + p.label);
                this.checkVictory("効果解決中");
                break;
              }
            }
            return moved;
          },
          lookTopOfDeck(side, n) {
            const p = this.state.players[side];
            return p.deck.slice(0, Math.min(n, p.deck.length));
          },
          /** resolve a look: taken → hand (reveal option), rest → bottom. bottomMode: 'random' (rng) | 'choose' (owner orders) | 'trash' */
          resolveLook(side, looked, taken, reveal, bottomMode) {
            const st = this.state, p = st.players[side];
            const takenList = taken == null ? [] : Array.isArray(taken) ? taken.filter(Boolean) : [taken];
            p.deck.splice(0, looked.length);
            if (takenList.length) this._addToHand(side, takenList, "回収", reveal);
            const rest = looked.filter((c) => takenList.indexOf(c) === -1);
            if (bottomMode === "trash") {
              rest.forEach((c) => p.trash.push(c));
              if (rest.length) st.log.push("トラッシュへ：" + p.label + " " + rest.length + "枚（見た残り）");
            } else this.putOnBottom(side, rest, bottomMode === "random" ? "random" : "choose");
            if (!p.deck.length) {
              st.log.push("山札が0枚になりました：" + p.label);
              this.checkVictory("効果解決中");
            }
          },
          /** put cards under the deck. mode 'random' → rng order; 'choose' → owner picks the order when >1 (R§8) */
          putOnBottom(side, cards, mode) {
            const st = this.state, p = st.players[side];
            let ordered = cards.slice();
            if (ordered.length > 1) {
              if (mode === "random") this._shuffle("bottom:" + side, ordered);
              else {
                const ops = this._opsFor(side, { source: p.field, kind: "order" });
                let r = null;
                ops.pickOrder({ title: "デッキの下に置く順番", message: "上から順に選んでください（先に選んだものが上）", items: ordered.slice() }, (v) => {
                  r = v;
                });
                if (!r || r.length !== ordered.length) throw new GD1Unsupported("pickOrder did not complete");
                ordered = r;
              }
            }
            ordered.forEach((c) => {
              this._resetOffField(c);
              p.deck.push(c);
            });
            if (ordered.length) st.log.push("山札下へ戻す：" + p.label + " " + ordered.length + "枚" + (mode === "random" ? "（順番は非公開・ランダム）" : ""));
          },
          moveTrashToHand(side, inst) {
            const st = this.state, p = st.players[side];
            const i = p.trash.indexOf(inst);
            if (i === -1) return false;
            if (p.hand.length >= HAND_LIMIT) {
              st.log.push("手札上限のため、《" + nameOf(inst) + "》を手札に加えられませんでした。");
              return false;
            }
            p.trash.splice(i, 1);
            this._addToHand(side, [inst], "回収");
            return true;
          },
          /** summon from trash by effect (団地・切り札2・ナイトサファリ). pay: energy to pay (0 = free) */
          summonFromTrash(side, inst, pay, why) {
            const st = this.state, p = st.players[side];
            const i = p.trash.indexOf(inst);
            if (i === -1) return null;
            if (inst.master.type === "youkai" && p.youkai.length >= MAX_YOUKAI) {
              st.log.push("不発：怪異エリアが上限");
              return null;
            }
            if (inst.master.type === "human" && p.humans.length >= MAX_HUMANS) {
              st.log.push("不発：人間エリアが上限");
              return null;
            }
            const r = Effects.playRestriction(side, inst, inst.master, st);
            if (r) {
              st.log.push("不発：" + r);
              return null;
            }
            if (pay) {
              if (p.energy < pay) {
                st.log.push("不発：気力不足");
                return null;
              }
              p.energy -= pay;
            }
            p.trash.splice(i, 1);
            this._placeUnit(side, inst, 0, "トラッシュから／" + (pay ? "気力" + pay + "支払い" : "コスト不要") + (why ? "・" + why : ""), "trash");
            return inst;
          },
          summonFromLost(side, cardName, named) {
            const st = this.state, p = st.players[side];
            const i = p.lost.findIndex((c) => nameOf(c) === cardName && (named || this.canLeaveLostByGenericEffect(c)));
            if (i === -1) {
              st.log.push("不発：ロストに対象のカードがありません");
              return null;
            }
            const card = p.lost[i];
            if (card.master.type === "human" && p.humans.length >= MAX_HUMANS) {
              st.log.push("不発：人間エリアが上限のため登場できません");
              return null;
            }
            if (card.master.type === "youkai" && p.youkai.length >= MAX_YOUKAI) {
              st.log.push("不発：怪異エリアが上限");
              return null;
            }
            p.lost.splice(i, 1);
            this._placeUnit(side, card, 0, "ロストから／コスト不要", "lost");
            return card;
          },
          /** move own field human to lost by effect (供物) */
          sacrificeToLost(side, inst, why) {
            this._leaveField(inst, "lost", why || "効果");
          },
          returnToHand(inst, why) {
            this._leaveField(inst, "hand", why || "効果");
          },
          /* ---------------------------------------------------------------- damage (R§14/15 reductions apply to effect damage) */
          dealEffectDamage(target, amount, sourceName, bySide) {
            const st = this.state;
            let red = 0;
            if (bySide != null && bySide !== target.owner) {
              for (const e of st.tempEffects) if ((e.kind === "effectDamageReduction" || e.kind === "allDamageReduction") && this._tempTargets(e, target)) red += e.amount;
            }
            const final = Math.max(0, amount - red);
            target.accumulatedDamage += final;
            st.log.push("効果ダメージ：" + (sourceName ? sourceName + " → " : "") + nameOf(target) + " に " + final + (red ? "（" + red + "軽減）" : ""));
          },
          healDamage(target, amount) {
            const b = target.accumulatedDamage;
            target.accumulatedDamage = amount == null ? 0 : Math.max(0, b - amount);
            this.state.log.push("回復：" + nameOf(target) + " ダメージ " + b + " → " + target.accumulatedDamage);
          },
          recalcAndResolveDeaths(phaseLabel) {
            const st = this.state;
            const dead = [];
            let guard = 0;
            while (guard++ < 30) {
              if (!st || st.gameOver) break;
              const dying = [];
              ["village", "mansion"].forEach((side) => {
                const p = st.players[side];
                p.humans.concat(p.youkai).forEach((c) => {
                  const s = this.getStats(c);
                  if (s.hasStats && s.curHp <= 0) dying.push(c);
                });
              });
              if (!dying.length) break;
              dying.forEach((c) => {
                st.log.push("致死：" + nameOf(c) + "（現在体力0以下）");
                this._leaveField(c, null, phaseLabel);
                dead.push(c);
              });
              this.checkVictory(phaseLabel);
            }
            return dead;
          },
          /* ---------------------------------------------------------------- pursuit (R§5, R§5.1, R§5.2, R§12) */
          hasDoublePursuit(yk) {
            return hasKeyword(yk, "【二重追跡】");
          },
          /** may `yk` (side's youkai) declare a pursuit of `humans` (1 or 2 opp humans)? returns null or reason */
          pursuitBlockReason(side, yk, humans) {
            const st = this.state;
            if (yk.owner !== side || yk.tracking) return "追跡できない怪異";
            if (!humans.length) return "追跡先なし";
            if (humans.length > 1 && !this.hasDoublePursuit(yk)) return "二重追跡を持たない";
            if (humans.length > 2) return "追跡先は2枚まで";
            const opp = otherSide(side);
            if (this.isPursuitProtected(yk)) return null;
            for (const e of st.tempEffects) {
              if (e.kind === "pursuitBan" && e.banSide === side && (e.targetUid == null || e.targetUid === yk.uid)) return e.note || "追跡禁止";
            }
            const r = Effects.pursuitRestriction(side, yk, humans, st);
            if (r) return r;
            return null;
          },
          isPursuitProtected(yk) {
            return this.state.tempEffects.some((e) => e.kind === "pursuitProtect" && this._tempTargets(e, yk));
          },
          setTracking(side, youkaiInst, humanOrHumans) {
            const st = this.state;
            const humans = Array.isArray(humanOrHumans) ? humanOrHumans.slice() : [humanOrHumans];
            const why = this.pursuitBlockReason(side, youkaiInst, humans);
            if (why) return { ok: false, reasons: [why] };
            st.tracking[side] = { youkai: youkaiInst, humans, human: humans[0] };
            youkaiInst.tracking = true;
            humans.forEach((h) => {
              h.tracking = true;
            });
            st.log.push("追跡：" + this.labelOf(side) + " " + nameOf(youkaiInst) + " → " + humans.map(nameOf).join("、"));
            this.emit(GAME_EVENT.PURSUIT_CONFIRMED, { side, youkai: youkaiInst, human: humans[0], humans });
            Effects.onPursuitDeclared(side, youkaiInst, humans, st);
            return { ok: true };
          },
          skipTracking(side) {
            this.state.log.push("追跡：" + this.labelOf(side) + " 追跡なし");
          },
          /** clear a pursuit by effect (respects protection) */
          clearPursuitOf(yk, why) {
            const st = this.state;
            const side = yk.owner;
            const t = st.tracking[side];
            if (!t || t.youkai !== yk) return false;
            if (this.isPursuitProtected(yk)) {
              st.log.push("追跡保護：" + nameOf(yk) + " の追跡は解除されない");
              return false;
            }
            t.humans.forEach((h) => {
              h.tracking = false;
            });
            yk.tracking = false;
            st.tracking[side] = null;
            st.log.push("追跡解除：" + nameOf(yk) + (why ? "（" + why + "）" : ""));
            return true;
          },
          /* ---------------------------------------------------------------- assault (R§5, R§5.2, R§9 鍵, R§15) */
          prepareAttack(side) {
            const st = this.state;
            const t = st.tracking[side];
            if (!t) return null;
            const attacker = t.youkai;
            const defenders = t.humans.slice();
            const aStats = this.getStats(attacker);
            const perHuman = defenders.map((h) => {
              const dStats = this.getStats(h);
              const red = this._calcReduction(h, side);
              return { human: h, rawToHuman: aStats.curSpeed, reductionHuman: red.total, finalToHuman: Math.max(0, aStats.curSpeed - red.total), rawFromHuman: dStats.curSpeed, usedGoods: red.usedGoods };
            });
            const rawToYoukai = perHuman.reduce((s, x) => s + x.rawFromHuman, 0);
            const redY = this._calcYoukaiReduction(attacker, side);
            const info = { side, attacker, defender: defenders[0], defenders, perHuman, rawToHuman: perHuman[0].rawToHuman, rawToYoukai, reductionHuman: perHuman[0].reductionHuman, reductionYoukai: redY, finalToHuman: perHuman[0].finalToHuman, finalToYoukai: Math.max(0, rawToYoukai - redY), usedGoods: perHuman.reduce((a, x) => a.concat(x.usedGoods), []) };
            return info;
          },
          _calcReduction(human, attackerSide) {
            let total = 0;
            const usedGoods = [];
            (human.equipment || []).forEach((g) => {
              const r = Effects.assaultReduction(g, human, this.state);
              if (r) {
                total += r.amount;
                if (r.trashAfterUse) usedGoods.push({ host: human, goods: g });
              }
            });
            for (const e of this.state.tempEffects) if (e.kind === "allDamageReduction" && this._tempTargets(e, human)) total += e.amount;
            return { total, usedGoods };
          },
          _calcYoukaiReduction(yk, side) {
            let total = 0;
            if (hasKeyword(yk, "この襲撃で相手の人間から受けるダメージを1軽減する")) total += 1;
            (yk.equipment || []).forEach((g) => {
              if (hasKeyword(g, "この襲撃で相手の人間から受けるダメージを")) {
                const m = String(g.master.effect).match(/受けるダメージを(\d)軽減/);
                if (m) total += Number(m[1]);
              }
            });
            return total;
          },
          applyAttackDamage(info) {
            const st = this.state;
            st.log.push("襲撃：" + this.labelOf(info.side) + " " + nameOf(info.attacker) + " → " + info.defenders.map(nameOf).join("、"));
            this.emit(GAME_EVENT.ASSAULT_STARTED, { side: info.side, attacker: info.attacker, defender: info.defender, defenders: info.defenders });
            info.perHuman.forEach((x) => {
              x.human.accumulatedDamage += x.finalToHuman;
              if (x.reductionHuman) st.log.push("軽減：" + nameOf(x.human) + " " + x.rawToHuman + " - " + x.reductionHuman + " = " + x.finalToHuman);
            });
            info.attacker.accumulatedDamage += info.finalToYoukai;
            st.log.push("ダメージ：" + info.perHuman.map((x) => nameOf(x.human) + " に " + x.finalToHuman).join("／") + "／" + nameOf(info.attacker) + " に " + info.finalToYoukai + "（反撃）");
            this.emit(GAME_EVENT.DAMAGE_DEALT, { side: info.side, toHuman: { card: info.defender, amount: info.finalToHuman }, toYoukai: { card: info.attacker, amount: info.finalToYoukai } });
            info.usedGoods.forEach((u) => {
              this._detachGoods(u.host, u.goods);
              st.players[u.goods.owner].trash.push(u.goods);
              st.log.push("移動：" + nameOf(u.goods) + "（軽減に使用）→ トラッシュ");
              this.queueEffect("leave", u.goods);
            });
          },
          finishAttack(info) {
            const st = this.state;
            const side = info.side, opp = otherSide(side);
            const dying = [];
            [info.attacker].concat(info.defenders).forEach((c) => {
              if (this.getStats(c).curHp <= 0) dying.push(c);
            });
            const humansLost = info.defenders.filter((h) => dying.indexOf(h) !== -1);
            dying.forEach((c) => this._leaveField(c, null, "襲撃"));
            [info.attacker].concat(info.defenders).forEach((c) => {
              if (dying.indexOf(c) !== -1) return;
              c.tracking = false;
              const p = st.players[c.owner];
              const zone = c.master.type === "human" ? p.humans : p.youkai;
              const i = zone.indexOf(c);
              if (i !== -1) {
                zone.splice(i, 1);
                zone.push(c);
              }
            });
            st.tracking[side] = null;
            st.lastAssault = { side, attackerUid: info.attacker.uid, humansLost: humansLost.length, attackerAlive: dying.indexOf(info.attacker) === -1 };
            this.checkVictory("襲撃中");
            const extra = this.recalcAndResolveDeaths("襲撃中");
            if (!st.gameOver) {
              Effects.onAssaultResolved(side, info, humansLost, st);
              this._expireEffects("ownAssaultEnd", side);
              this._expireEffects("oppAssaultEnd", opp);
              this.recalcAndResolveDeaths("襲撃後（持続効果の終了）");
            }
            return dying.concat(extra);
          },
          /* ---------------------------------------------------------------- transform (R§10) */
          transform(inst, toFace, why) {
            const st = this.state, p = st.players[inst.owner];
            if (!inst.faces || toFace >= inst.faces.length) throw new GD1Unsupported("transform: no such face", { card: inst.cardId, toFace });
            const oldMaster = inst.master, newMaster = CARD_MASTER[inst.faces[toFace]];
            const fromZone = oldMaster.type === "human" ? p.humans : p.youkai, toZone = newMaster.type === "human" ? p.humans : p.youkai;
            if (fromZone.indexOf(inst) === -1) return { ok: false, reasons: ["場にいない"] };
            if (fromZone !== toZone && (newMaster.type === "youkai" && p.youkai.length >= MAX_YOUKAI || newMaster.type === "human" && p.humans.length >= MAX_HUMANS)) return { ok: false, reasons: ["変身先のエリアが上限"] };
            inst.equipment.slice().forEach((g) => {
              this._detachGoods(inst, g);
              p.trash.push(g);
              st.log.push("移動：" + nameOf(g) + "（変身のため装備解除）→ トラッシュ");
              this.queueEffect("leave", g);
            });
            this._clearTrackingWith(inst);
            inst.tracking = false;
            inst.accumulatedDamage = 0;
            if (fromZone !== toZone) {
              fromZone.splice(fromZone.indexOf(inst), 1);
              toZone.push(inst);
            }
            inst.faceIndex = toFace;
            inst.master = newMaster;
            inst.cardId = newMaster.id;
            inst.enteredTurn = st.turnCount;
            st.log.push("変身：" + p.label + " " + oldMaster.name + " → " + newMaster.name + (why ? "（" + why + "）" : ""));
            this.recalcAndResolveDeaths("変身");
            if (!st.gameOver) this.queueEnterEffect(inst);
            return { ok: true };
          },
          /* ---------------------------------------------------------------- noise (R§17) */
          gainNoise(side, n, why) {
            const st = this.state, p = st.players[side];
            if (n <= 0) return;
            const prevTier = Math.floor(p.noise.gained / NOISE_STEP);
            p.noise.gained += n;
            p.noise.current += n;
            st.log.push("物音：" + p.label + " +" + n + " → " + p.noise.current + "（累計" + p.noise.gained + "）" + (why ? "（" + why + "）" : ""));
            const newTier = Math.floor(p.noise.gained / NOISE_STEP);
            for (let k = prevTier + 1; k <= newTier; k++) st.pendingEffects.push(this._mkItem("noise", p.field, side, { tierTotal: k * NOISE_STEP }));
          },
          payNoise(side, n) {
            const p = this.state.players[side];
            if (p.noise.current < n) return false;
            p.noise.current -= n;
            this.state.log.push("物音支払い：" + p.label + " -" + n + " → " + p.noise.current);
            return true;
          },
          /* ---------------------------------------------------------------- effect queue (R§2) */
          _rankOf(kind, inst) {
            if (kind === "event") return 0;
            const t = inst.master.type;
            if (t === "field") return 1;
            if (t === "human") return 2;
            if (t === "youkai") return 3;
            if (t === "goods") return 4;
            return 5;
          },
          _mkItem(kind, inst, side, extra) {
            const it = Object.assign({ kind, source: inst, side, rank: this._rankOf(kind, inst), seq: ++this.state.seq, master: inst.master }, extra || {});
            return it;
          },
          queueEffect(kind, inst, extra) {
            const st = this.state;
            if (st.gameOver) return;
            const master = extra && extra.master || inst.master;
            if (!Effects.hasEffect(kind, master.id)) return;
            st.pendingEffects.push(this._mkItem(kind, inst, inst.owner, extra));
          },
          queueEnterEffect(inst) {
            this.queueEffect("enter", inst);
          },
          /** candidates that could be resolved next (same side, same rank) — exposed so the order is the player's decision (R§2) */
          pendingOrderCandidates() {
            const st = this.state;
            if (st.gameOver || !st.pendingEffects.length) return [];
            const turnFirst = st.pendingEffects.filter((x) => x.side === st.currentSide);
            const pool = turnFirst.length ? turnFirst : st.pendingEffects;
            const minRank = Math.min.apply(null, pool.map((x) => x.rank));
            return pool.filter((x) => x.rank === minRank);
          },
          /** take the next effect; when several same-side same-rank effects wait, the owner chooses via `chooser(side, items)`
              (falls back to the registered decision provider's pickOrder; if neither exists, FIFO and logged as auto-order). */
          takeNextPending(chooser) {
            const st = this.state;
            if (st.gameOver) {
              st.pendingEffects = [];
              return null;
            }
            let cands = this.pendingOrderCandidates();
            if (!cands.length) return null;
            const fixed = cands.filter((x) => x.fixedOrder);
            if (fixed.length) {
              const firstFixed = fixed.reduce((a, b) => a.seq < b.seq ? a : b);
              cands = cands.filter((x) => !x.fixedOrder).concat([firstFixed]).sort((a, b) => a.seq - b.seq);
            }
            let pick = cands[0];
            if (cands.length > 1) {
              const side = pick.side;
              if (chooser) pick = chooser(side, cands) || cands[0];
              else if (this.decisionProviders[side] || st.__simProviders) {
                const ops = this._opsFor(side, { source: st.players[side].field, kind: "order", cands });
                if (ops.pickOrder) {
                  let r = null;
                  ops.pickOrder({ title: "効果の解決順", message: "先に解決する効果を選んでください", items: cands.slice() }, (v) => {
                    r = v;
                  });
                  if (r && r.length) pick = r[0];
                } else st.log.push("（解決順：選択者なし → 待機順で自動）");
              } else st.log.push("（解決順：選択者なし → 待機順で自動）");
            }
            const i = st.pendingEffects.indexOf(pick);
            st.pendingEffects.splice(i, 1);
            return pick;
          },
          runEffect(item, uiOps, done) {
            const st = this.state;
            if (st.gameOver) {
              done();
              return;
            }
            if (this._decisionSnapshotter && !st.__simProviders) {
              st.__resolving = item;
              try {
                this._itemSnapshot = { item, snap: this._decisionSnapshotter(st), made: { village: [], mansion: [] } };
              } finally {
                delete st.__resolving;
              }
            }
            const KIND = { enter: "【登場時】", leave: "【離れた時】", event: "（イベント使用）", endTurn: "【ターン終了時】", startTurn: "【ターン開始時】", lostThird: "【ロスト3枚目】", onEquip: "【装備時】", noise: "【物音】", reaction: "（誘発）", hostLeft: "（装備先が場を離れた時）", ownAssault: "【自分の襲撃時】", oppAssault: "【相手の襲撃時】" };
            st.log.push("効果：" + this.labelOf(item.side) + " " + item.master.name + (KIND[item.kind] || item.kind));
            const fk = item.master.id + ":" + (item.kind === "reaction" ? item.react : item.kind);
            st.effectFired[fk] = (st.effectFired[fk] || 0) + 1;
            const ctx = this._makeCtx(item, uiOps);
            const self = this;
            Effects.runEffect(item, ctx, function() {
              if (item.kind === "event") {
                const p = st.players[item.side];
                const src = item.source;
                if (item.after === "trash" || !item.after) {
                  self._resetOffField(src);
                  p.trash.push(src);
                  st.log.push("トラッシュへ：" + self.labelOf(item.side) + " " + nameOf(src) + "（使用後）");
                } else if (item.after === "exile") {
                  const i = p.trash.indexOf(src);
                  if (i !== -1) p.trash.splice(i, 1);
                  p.exile.push(src);
                  st.log.push("除外：" + nameOf(src) + "（使用後）");
                }
              }
              self.recalcAndResolveDeaths("効果解決中");
              done();
            });
          },
          _makeCtx(item, uiOps) {
            const st = this.state;
            const self = this;
            const side = item.side;
            const ops = uiOps || this._opsFor(side, item);
            return {
              state: st,
              side,
              source: item.source,
              item,
              me: st.players[side],
              opponent: st.players[otherSide(side)],
              game: this,
              log: (msg) => st.log.push(msg),
              isOver: () => !!st.gameOver,
              confirmYesNo: ops.confirmYesNo,
              pickCards: ops.pickCards,
              pickBoardTarget: ops.pickBoardTarget,
              pickOption: ops.pickOption || function() {
                throw new GD1Unsupported("decision provider lacks pickOption");
              },
              pickOrder: ops.pickOrder || function() {
                throw new GD1Unsupported("decision provider lacks pickOrder");
              },
              showCards: (cards, next) => {
                const list = (Array.isArray(cards) ? cards : [cards]).filter(Boolean);
                if (!ops.showCards || !list.length) {
                  next();
                  return;
                }
                ops.showCards(list, next);
              },
              /** decisions that belong to the OPPONENT of the effect owner (forced play, opponent discards) */
              oppOps: () => self._opsFor(otherSide(side), item),
              /** targetable check honouring 「相手の効果によって選ばれない」 (R§12) */
              targetable: (cards) => cards.filter((c) => c.owner === side || !Effects.isImmuneToOppTargeting(c, st))
            };
          },
          isEffectUsed(key) {
            return this.state.effectUsed[key] === true;
          },
          markEffectUsed(key) {
            this.state.effectUsed[key] = true;
          },
          turnUseKey(side, name) {
            return "turn:" + side + ":" + name + ":" + this.state.turnCount;
          },
          gameUseKey(side, name) {
            return "game:" + side + ":" + name;
          },
          /** public-information signature used by the search stack to seed hidden-world sampling (no hidden contents; R§7 private info excluded).
              Covers the GD1 state that changes legality/values: faces, equipment, noise, duration effects, turn-use counters, once-flags, exile. */
          publicSignature(st, side) {
            const parts = [
              "gd1-v1.1",
              st.turnCount,
              /* ★AI の見えない世界の引き直しの種に入る固定の文字列。R28／v1.0 と同じ探索にするため据え置き（定義名 st.definition とは切り離した） */
              st.sideTurnCount.village,
              st.sideTurnCount.mansion,
              st.currentSide,
              st.phase,
              side
            ];
            const unit = (c) => c.cardId + "@" + c.uid + ":" + (c.accumulatedDamage || 0) + ":" + (c.faceIndex || 0) + ":" + (c.enteredTurn === st.turnCount ? "n" : "") + ":" + (c.equipment || []).map((g) => g.cardId + "@" + g.uid).join("+");
            ["village", "mansion"].forEach((s) => {
              const p = st.players[s];
              parts.push(s, p.energy, p.hand.length, p.deck.length, p.noise.current + "/" + p.noise.gained, JSON.stringify(p.turnUse), p.instantLoss ? "L" : "");
              parts.push("humans:" + p.humans.map(unit).join(","), "youkai:" + p.youkai.map(unit).join(","));
              ["lost", "trash", "exile"].forEach((z) => parts.push(z + ":" + p[z].map((c) => c.cardId + "@" + c.uid).join(",")));
              parts.push("field:" + (p.field ? p.field.cardId : ""));
            });
            ["village", "mansion"].forEach((s) => {
              const t = st.tracking[s];
              parts.push("tr:" + s + ":" + (t ? t.youkai.uid + ">" + t.humans.map((h) => h.uid).join("+") : "-"));
            });
            parts.push("fx:" + st.tempEffects.map((e) => [e.kind, e.owner, JSON.stringify(e.target), e.speed || 0, e.hp || 0, e.amount || 0, e.until.type, e.banSide || ""].join("/")).join(";"));
            parts.push("used:" + Object.keys(st.effectUsed).sort().join(","));
            return parts.join("|");
          },
          /** private information: `side` looked at the opponent's hand now (R§7: only the looker knows; not public) */
          recordHandLook(side, cards) {
            this.state.privateInfo[side].push({ turn: this.state.turnCount, kind: "oppHand", cards: cards.map((c) => c.cardId), uids: cards.map((c) => c.uid) });
          },
          _onHandDiscard(side, cards) {
            Effects.onHandDiscard(side, cards, this.state);
          }
        };
        const Effects = createEffects({ Game, CARD_MASTER, hasTrait, countTrait, isUnit, hasKeyword, nameOf, originalCost, otherSide, GD1Unsupported, MAX_YOUKAI, MAX_HUMANS });
        return { Game, Effects, CARD_MASTER, DECKS, RuntimeDecks, createInstance, GD1Unsupported, constants: { ENERGY_MAX, MAX_HUMANS, MAX_YOUKAI, HAND_LIMIT, NOISE_STEP }, helpers: { hasTrait, countTrait, originalCost, otherSide } };
      }
      var createEffects = require_effects_gd1().createEffects;
      module.exports = { createGd1Engine, GD1Unsupported, otherSide };
    }
  });

  // src/engine/cards-gd1.js
  var require_cards_gd1 = __commonJS({
    "src/engine/cards-gd1.js"(exports, module) {
      "use strict";
      var CARD_MASTER_GD1 = {
        "MURA-001": {
          "id": "MURA-001",
          "name": "放課後の帰り道 スミレ",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "村",
            "大人"
          ],
          "attribute": "怖がり",
          "attributeProvisional": false,
          "effect": "効果なし。初期配置カード。ロスト後に回収した場合は0コストで通常登場可能。",
          "baseCount": 1,
          "speed": 3,
          "hp": 2
        },
        "MURA-002": {
          "id": "MURA-002",
          "name": "孤独な夜道 ハルカ",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "村",
            "大人"
          ],
          "attribute": "クール",
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "MURA-003": {
          "id": "MURA-003",
          "name": "泣き虫転校生 ルナ",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "村",
            "制服"
          ],
          "attribute": "怖がり",
          "attributeProvisional": false,
          "effect": "【登場時】自分のデッキの上から2枚をトラッシュに置く。",
          "baseCount": 4,
          "speed": 2,
          "hp": 2
        },
        "MURA-004": {
          "id": "MURA-004",
          "name": "負けず嫌い カエデ",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "村",
            "制服"
          ],
          "attribute": "元気",
          "attributeProvisional": false,
          "effect": "【登場時】自分の手札を2枚まで捨てる。その後、捨てた枚数ぶん自分はドローする。",
          "baseCount": 3,
          "speed": 3,
          "hp": 4
        },
        "MURA-005": {
          "id": "MURA-005",
          "name": "頼れる委員長 リン",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "村",
            "制服",
            "リーダー"
          ],
          "attribute": "クール",
          "attributeProvisional": false,
          "effect": "【登場時】【ターンに1回】自分のトラッシュに特徴〔村〕を持つカードが10枚以上あるなら、相手の怪異1枚に2ダメージを与える。",
          "baseCount": 3,
          "speed": 2,
          "hp": 4
        },
        "MURA-006": {
          "id": "MURA-006",
          "name": "寂しがる市松人形",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "村",
            "人形"
          ],
          "attribute": "幽霊",
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 2
        },
        "MURA-007": {
          "id": "MURA-007",
          "name": "狐のお面 コハク",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "村",
            "子ども"
          ],
          "attribute": "幽霊",
          "attributeProvisional": false,
          "effect": "自分のトラッシュに特徴〔村〕を持つカードが5枚以上あるなら、このカードのスピードを+1する。",
          "baseCount": 4,
          "speed": 3,
          "hp": 4
        },
        "MURA-008": {
          "id": "MURA-008",
          "name": "朽ちゆく嗤い案山子",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "村",
            "呪い"
          ],
          "attribute": "悪魔",
          "attributeProvisional": false,
          "effect": "【登場時】自分の手札1枚を捨てる。その後、自分のトラッシュから、「朽ちゆく嗤い案山子」以外の特徴〔村〕を持つ人間/怪異のいずれか1枚を手札に加えることができる。",
          "baseCount": 4,
          "speed": 3,
          "hp": 4
        },
        "MURA-009": {
          "id": "MURA-009",
          "name": "山を守るヌシ様",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "村",
            "自然",
            "神秘"
          ],
          "attribute": "怪物",
          "attributeProvisional": false,
          "effect": "自分のトラッシュに特徴〔村〕を持つカードが10枚以上あるなら、相手の人間/怪異カード全てのスピードを-1する。",
          "baseCount": 3,
          "speed": 4,
          "hp": 6
        },
        "MURA-010": {
          "id": "MURA-010",
          "name": "懐中電灯",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "goods",
          "cost": 0,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "装備できる相手：人間。体力+1。効果なし。",
          "baseCount": 3,
          "equipBonus": {
            "hp": 1
          },
          "equipTarget": {
            "type": "human",
            "trait": null,
            "name": null
          },
          "generic": true
        },
        "MURA-011": {
          "id": "MURA-011",
          "name": "古いお札",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "村",
            "呪い"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "装備できる相手：怪異。スピード+1。自分のトラッシュにカードが10枚以上あるなら、このカードのスピードをさらに+1する。",
          "baseCount": 2,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": null,
            "name": null
          }
        },
        "MURA-012": {
          "id": "MURA-012",
          "name": "境界線",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "event",
          "cost": 0,
          "traits": [
            "神秘"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分の手札1枚を捨てる。その後、自分は2枚ドローする。",
          "baseCount": 3,
          "oncePerTurnName": true,
          "generic": true
        },
        "MURA-013": {
          "id": "MURA-013",
          "name": "引き戻す力",
          "faction": "MURA",
          "deck": "村",
          "pool": "base",
          "type": "event",
          "cost": 0,
          "traits": [
            "村",
            "神秘"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分の手札1枚を捨てる。その後、自分のトラッシュから、特徴〔村〕を持つ人間/怪異/グッズのいずれか1枚を手札に加える。",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "MURA-014": {
          "id": "MURA-014",
          "name": "村1",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "村"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": null,
          "speed": 3,
          "hp": 2
        },
        "MURA-015": {
          "id": "MURA-015",
          "name": "村2",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "村"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": null,
          "speed": 3,
          "hp": 6
        },
        "MURA-016": {
          "id": "MURA-016",
          "name": "村3",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "村"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】この襲撃で《悪魔》の怪異から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "MURA-017": {
          "id": "MURA-017",
          "name": "村4",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "村"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から3枚をトラッシュに置く",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "MURA-018": {
          "id": "MURA-018",
          "name": "村5",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "human",
          "cost": 6,
          "traits": [
            "村"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のロストゾーンから元のコスト1以上のカード1枚を選び、自分のトラッシュに置くことができる。その後、自分のトラッシュから元のコスト2以下の怪異1枚を自分の場に出すことができる",
          "baseCount": null,
          "speed": 4,
          "hp": 8
        },
        "MURA-019": {
          "id": "MURA-019",
          "name": "村A",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "村"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔村〕を持つカードを3枚除外することができる。そうしたなら、相手の怪異1枚を選ぶ。その怪異は、次の相手の襲撃時に追跡できない",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "MURA-020": {
          "id": "MURA-020",
          "name": "村B",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "村"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔村〕を持つカードを5枚除外することができる。そうしたなら、相手の怪異すべては、次の相手の襲撃時に追跡できない",
          "baseCount": null,
          "speed": 4,
          "hp": 8
        },
        "MURA-021": {
          "id": "MURA-021",
          "name": "村D",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "村"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から2枚をトラッシュに置く",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "MURA-022": {
          "id": "MURA-022",
          "name": "村E",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "村"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "このカードが特徴〔制服〕を持つ人間を追跡しているなら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "MURA-023": {
          "id": "MURA-023",
          "name": "村F",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "村"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【離れた時】自分の手札1枚を捨てることができる。そうしたなら、このカードを自分の手札に加える",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "MURA-024": {
          "id": "MURA-024",
          "name": "村G",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "村"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュからグッズ1枚を手札に加えることができる",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "MURA-025": {
          "id": "MURA-025",
          "name": "忘れられた名",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "event",
          "cost": 1,
          "traits": [
            "村"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分のトラッシュからカードを3枚除外する。その後、このターン、相手の怪異1枚の体力を-1する",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "MURA-026": {
          "id": "MURA-026",
          "name": "村甲",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "goods",
          "cost": 0,
          "traits": [
            "村"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "人間に装備。自分のトラッシュにカードが10枚以上あるなら、このカードのスピードを+1する",
          "baseCount": null,
          "equipBonus": {},
          "equipTarget": {
            "type": "human",
            "trait": null,
            "name": null
          }
        },
        "MURA-027": {
          "id": "MURA-027",
          "name": "村乙",
          "faction": "MURA",
          "deck": "村",
          "pool": "pool",
          "type": "goods",
          "cost": 0,
          "traits": [
            "村"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "人間に装備・補正なし。このカードがトラッシュに置かれた時、自分のデッキの上から2枚をトラッシュに置く",
          "baseCount": null,
          "equipBonus": {},
          "equipTarget": {
            "type": "human",
            "trait": null,
            "name": null
          }
        },
        "YAKATA-001": {
          "id": "YAKATA-001",
          "name": "屋敷の令嬢 エリーゼ",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "洋館",
            "屋敷の主"
          ],
          "attribute": "元気",
          "attributeProvisional": false,
          "effect": "効果なし。初期配置カード。ロスト後に回収した場合は0コストで通常登場可能。",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "YAKATA-002": {
          "id": "YAKATA-002",
          "name": "不憫な客人 アネット",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "洋館",
            "客人",
            "迷子"
          ],
          "attribute": "怖がり",
          "attributeProvisional": false,
          "effect": "【離れた時】自分のデッキの上から3枚を見る。その中から、特徴〔洋館〕を持つ人間/怪異のいずれか1枚を公開し、手札に加えることができる。その後、残りをランダムにデッキの下に戻す。",
          "baseCount": 4,
          "speed": 2,
          "hp": 2
        },
        "YAKATA-003": {
          "id": "YAKATA-003",
          "name": "微笑む使用人 エマ",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "洋館",
            "使用人"
          ],
          "attribute": "元気",
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "YAKATA-004": {
          "id": "YAKATA-004",
          "name": "招かれた令嬢 リリィ",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "洋館",
            "客人"
          ],
          "attribute": "クール",
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 2
        },
        "YAKATA-005": {
          "id": "YAKATA-005",
          "name": "寡黙な使用人 シルヴィ",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "洋館",
            "使用人",
            "案内人"
          ],
          "attribute": "クール",
          "attributeProvisional": false,
          "effect": "【登場時】自分のデッキの上から5枚を見る。その中から、特徴〔洋館〕を持つグッズ/イベントのいずれか1枚と、「企む貴婦人 イザベラ」1枚を公開し、手札に加えることができる。その後、残りをランダムにデッキの下に戻す。",
          "baseCount": 4,
          "speed": 2,
          "hp": 4
        },
        "YAKATA-006": {
          "id": "YAKATA-006",
          "name": "紫炎の執事 クロード",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "洋館",
            "執事"
          ],
          "attribute": "悪魔",
          "attributeProvisional": false,
          "effect": "【離れた時】自分のフィールドが特徴〔洋館〕を持つなら、自分の気力を1回復する。",
          "baseCount": 3,
          "speed": 2,
          "hp": 2
        },
        "YAKATA-007": {
          "id": "YAKATA-007",
          "name": "地下室に棲むキメラ",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "洋館",
            "異形"
          ],
          "attribute": "怪物",
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 2
        },
        "YAKATA-008": {
          "id": "YAKATA-008",
          "name": "彷徨う亡霊甲冑",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "洋館",
            "亡霊"
          ],
          "attribute": "幽霊",
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 4
        },
        "YAKATA-009": {
          "id": "YAKATA-009",
          "name": "企む貴婦人 イザベラ",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "洋館",
            "屋敷の主",
            "黒幕"
          ],
          "attribute": "悪魔",
          "attributeProvisional": false,
          "effect": "【登場時】【ゲーム中に1回】自分のロストゾーンから、「屋敷の令嬢 エリーゼ」1枚を自分の場に出す。／自分のロストゾーンに特徴〔洋館〕を持つカードが3枚以上あるなら、自分の特徴〔洋館〕を持つ怪異すべてと「屋敷の令嬢 エリーゼ」のスピードと体力を+2する。／このカードは、相手の効果によって選ばれない。",
          "baseCount": 3,
          "speed": 3,
          "hp": 6
        },
        "YAKATA-010": {
          "id": "YAKATA-010",
          "name": "小さな鍵",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "洋館"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "装備できる相手：〔洋館〕人間。【相手の襲撃時】この襲撃で受けるダメージを2軽減する。自分の場に「企む貴婦人 イザベラ」があるなら、かわりに4軽減する。その後、このグッズをトラッシュに置く。",
          "baseCount": 3,
          "equipBonus": {},
          "equipTarget": {
            "type": "human",
            "trait": "洋館",
            "name": null
          }
        },
        "YAKATA-011": {
          "id": "YAKATA-011",
          "name": "黒い指輪",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "洋館",
            "魔力"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "装備できる相手：〔洋館〕怪異。スピード+1。自分のロストゾーンにカードが3枚以上あるなら、このカードのスピードをさらに+1する。",
          "baseCount": 2,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": "洋館",
            "name": null
          }
        },
        "YAKATA-012": {
          "id": "YAKATA-012",
          "name": "黒薔薇の策略",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "base",
          "type": "event",
          "cost": 2,
          "traits": [
            "洋館",
            "黒幕"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "自分の場に「企む貴婦人 イザベラ」があるなら、相手の怪異1枚に2ダメージを与える。",
          "baseCount": 3,
          "oncePerTurnName": false
        },
        "YAKATA-013": {
          "id": "YAKATA-013",
          "name": "館1",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "洋館"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のフィールドが特徴〔洋館〕を持つなら、自分の気力を1回復する",
          "baseCount": null,
          "speed": 2,
          "hp": 6
        },
        "YAKATA-014": {
          "id": "YAKATA-014",
          "name": "館3",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "洋館"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分の特徴〔洋館〕を持つ人間を追跡している相手の怪異1枚を選ぶ。その怪異の追跡先を、このカードに変更する",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "YAKATA-015": {
          "id": "YAKATA-015",
          "name": "館4",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "洋館"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】この襲撃で《怪物》の怪異から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "YAKATA-016": {
          "id": "YAKATA-016",
          "name": "館5",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "human",
          "cost": 4,
          "traits": [
            "洋館"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のロストゾーンから元のコスト1以上の特徴〔洋館〕を持つ人間1枚を自分の場に出すことができる",
          "baseCount": null,
          "speed": 4,
          "hp": 7
        },
        "YAKATA-017": {
          "id": "YAKATA-017",
          "name": "館6",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "洋館"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分の手札から特徴〔洋館〕を持つ人間1枚を公開することができる。そうしたなら、自分のロストゾーンから元のコスト1以上のカード1枚を手札に加え、公開したカードをロストゾーンに置く",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "YAKATA-018": {
          "id": "YAKATA-018",
          "name": "館A",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "洋館"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【登場時】自分のロストゾーンに特徴〔洋館〕を持つカードが3枚以上あるなら、自分は1枚ドローする",
          "baseCount": null,
          "speed": 4,
          "hp": 4
        },
        "YAKATA-019": {
          "id": "YAKATA-019",
          "name": "館B",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "洋館"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【登場時】自分の手札から「イザベラ」1枚を公開することができる。そうしたなら、このカードのスピードを+1する（永続）",
          "baseCount": null,
          "speed": 3,
          "hp": 2
        },
        "YAKATA-020": {
          "id": "YAKATA-020",
          "name": "館D",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "youkai",
          "cost": 6,
          "traits": [
            "洋館"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "自分のロストゾーンに特徴〔洋館〕を持つカードが2枚以上あるなら、このカードのコストを-3する／相手の人間すべてのスピードを-1する",
          "baseCount": null,
          "speed": 3,
          "hp": 6
        },
        "YAKATA-021": {
          "id": "YAKATA-021",
          "name": "館F",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "youkai",
          "cost": 8,
          "traits": [
            "洋館"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "自分のロストゾーンに特徴〔洋館〕を持つカードが3枚以上あるなら、このカードのコストを-3する／【登場時】相手の怪異1枚をトラッシュに置く／【自分の襲撃時】相手の人間1枚に2ダメージを与える",
          "baseCount": null,
          "speed": 4,
          "hp": 7
        },
        "YAKATA-022": {
          "id": "YAKATA-022",
          "name": "館G",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "洋館"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で追跡している人間が《怖がり》なら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 3,
          "hp": 2
        },
        "YAKATA-023": {
          "id": "YAKATA-023",
          "name": "館H",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "洋館"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "YAKATA-024": {
          "id": "YAKATA-024",
          "name": "館I",
          "faction": "YAKATA",
          "deck": "洋館",
          "pool": "pool",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "洋館"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のフィールドが特徴〔洋館〕を持つなら、自分の気力を2回復する",
          "baseCount": null,
          "speed": 4,
          "hp": 7
        },
        "DANCHI-001": {
          "id": "DANCHI-001",
          "name": "初期",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "団地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 3,
          "hp": 2
        },
        "DANCHI-002": {
          "id": "DANCHI-002",
          "name": "団人1",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 2
        },
        "DANCHI-003": {
          "id": "DANCHI-003",
          "name": "団人2",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "DANCHI-004": {
          "id": "DANCHI-004",
          "name": "団人3",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から3枚を見る。その中から特徴〔団地〕を持つ人間/怪異1枚を手札に加えることができる。残りをデッキの下に戻す。",
          "baseCount": 3,
          "speed": 2,
          "hp": 2
        },
        "DANCHI-005": {
          "id": "DANCHI-005",
          "name": "団人4",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "団地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔団地〕を持つ元のコスト1以下の怪異1枚を自分の場に出すことができる",
          "baseCount": 4,
          "speed": 2,
          "hp": 3
        },
        "DANCHI-006": {
          "id": "DANCHI-006",
          "name": "団怪1",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 2
        },
        "DANCHI-007": {
          "id": "DANCHI-007",
          "name": "団怪2",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 1
        },
        "DANCHI-008": {
          "id": "DANCHI-008",
          "name": "団怪3",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のトラッシュからグッズ1枚を手札に加えることができる",
          "baseCount": 4,
          "speed": 2,
          "hp": 2
        },
        "DANCHI-009": {
          "id": "DANCHI-009",
          "name": "団怪4",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔団地〕を持つ元のコスト1以下の怪異1枚を自分の場に出すことができる",
          "baseCount": 4,
          "speed": 4,
          "hp": 2
        },
        "DANCHI-010": {
          "id": "DANCHI-010",
          "name": "団グ1",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "怪異に装備・効果なし",
          "baseCount": 3,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": null,
            "name": null
          }
        },
        "DANCHI-011": {
          "id": "DANCHI-011",
          "name": "団グ2",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "人間に装備・効果なし",
          "baseCount": 2,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "human",
            "trait": null,
            "name": null
          }
        },
        "DANCHI-012": {
          "id": "DANCHI-012",
          "name": "団イ",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "base",
          "type": "event",
          "cost": 2,
          "traits": [
            "団地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【ゲーム中に1回】自分のトラッシュから特徴〔団地〕を持つ元のコスト1以下の怪異2枚を自分の場に出す",
          "baseCount": 2,
          "oncePerTurnName": false
        },
        "DANCHI-013": {
          "id": "DANCHI-013",
          "name": "団2",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "団地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔団地〕を持つグッズ1枚を手札に加えることができる",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "DANCHI-014": {
          "id": "DANCHI-014",
          "name": "団3",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "団地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分の特徴〔団地〕を持つ元のコスト1以下の怪異すべてのスピードを+1する",
          "baseCount": null,
          "speed": 2,
          "hp": 5
        },
        "DANCHI-015": {
          "id": "DANCHI-015",
          "name": "団4",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【登場時】自分は1枚ドローする",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "DANCHI-016": {
          "id": "DANCHI-016",
          "name": "団7",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】この襲撃で《怪物》の怪異から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "DANCHI-017": {
          "id": "DANCHI-017",
          "name": "団8",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "団地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のトラッシュから特徴〔団地〕を持つグッズ1枚を、自分の場の怪異1体に装備することができる",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "DANCHI-018": {
          "id": "DANCHI-018",
          "name": "団A",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で追跡している人間が《クール》なら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "DANCHI-019": {
          "id": "DANCHI-019",
          "name": "団B",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から2枚を見る。その中から特徴〔団地〕を持つ人間/怪異のいずれか1枚を手札に加えることができる。残りをトラッシュに置く",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "DANCHI-020": {
          "id": "DANCHI-020",
          "name": "団C",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔団地〕を持つ元のコスト1以下の怪異1枚を手札に加えることができる",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "DANCHI-021": {
          "id": "DANCHI-021",
          "name": "団D",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "DANCHI-022": {
          "id": "DANCHI-022",
          "name": "団E",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔団地〕を持つ元のコスト1以下の怪異2枚を自分の場に出すことができる",
          "baseCount": null,
          "speed": 3,
          "hp": 4
        },
        "DANCHI-023": {
          "id": "DANCHI-023",
          "name": "団F",
          "faction": "DANCHI",
          "deck": "団地",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "団地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "自分の特徴〔団地〕を持つ元のコスト1以下の怪異は、相手の効果によってダメージを受けない",
          "baseCount": null,
          "speed": 2,
          "hp": 5
        },
        "GAKKO-001": {
          "id": "GAKKO-001",
          "name": "初期",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "学校"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "GAKKO-002": {
          "id": "GAKKO-002",
          "name": "学人a",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 2,
          "hp": 3
        },
        "GAKKO-003": {
          "id": "GAKKO-003",
          "name": "学人b",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 1,
          "speed": 3,
          "hp": 2
        },
        "GAKKO-004": {
          "id": "GAKKO-004",
          "name": "学人c",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "学校"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 4
        },
        "GAKKO-005": {
          "id": "GAKKO-005",
          "name": "学人d",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "学校"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から3枚を見る。その中から特徴〔学校〕を持つ人間1枚を公開し、手札に加えることができる。その後、残りをトラッシュに置く",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "GAKKO-006": {
          "id": "GAKKO-006",
          "name": "学怪a",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 3,
          "hp": 2
        },
        "GAKKO-007": {
          "id": "GAKKO-007",
          "name": "学怪b",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から1枚を見る。それが特徴〔学校〕を持つ怪異なら、手札に加えることができる。手札に加えなかったなら、デッキの下に置く",
          "baseCount": 4,
          "speed": 2,
          "hp": 2
        },
        "GAKKO-008": {
          "id": "GAKKO-008",
          "name": "学怪c",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【自分のターン終了時】自分の場に特徴〔学校〕を持つ人間がいないなら、このカードをトラッシュに置く",
          "baseCount": 4,
          "speed": 4,
          "hp": 1
        },
        "GAKKO-009": {
          "id": "GAKKO-009",
          "name": "学怪d",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 3,
          "hp": 1
        },
        "GAKKO-010": {
          "id": "GAKKO-010",
          "name": "赤マント",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "youkai",
          "cost": 8,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "自分のトラッシュに特徴〔学校〕を持つ元のコスト1以下の怪異が1枚あるごとに、このカードのコストを-1する。ただし、コストは1未満にならない／このカードのスピードと体力は、相手の効果によって下がらない／【登場時】【ゲーム中に1回】相手の元のコスト4以下の怪異すべてをトラッシュに置く",
          "baseCount": 4,
          "speed": 4,
          "hp": 8
        },
        "GAKKO-011": {
          "id": "GAKKO-011",
          "name": "学グ1",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "goods",
          "cost": 0,
          "traits": [
            "学校"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "人間に装備・補正なし。自分のトラッシュのカードは、相手の効果によってトラッシュを離れない",
          "baseCount": 1,
          "equipBonus": {},
          "equipTarget": {
            "type": "human",
            "trait": null,
            "name": null
          }
        },
        "GAKKO-012": {
          "id": "GAKKO-012",
          "name": "学グ2",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "goods",
          "cost": 0,
          "traits": [
            "学校"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "怪異に装備・補正なし。【自分の襲撃時】この襲撃で相手の人間がロストゾーンに置かれたなら、自分は1枚ドローする。その後、自分の手札1枚を捨てる",
          "baseCount": 2,
          "equipBonus": {},
          "equipTarget": {
            "type": "youkai",
            "trait": null,
            "name": null
          },
          "errata": "v1.1 ruling 7"
        },
        "GAKKO-013": {
          "id": "GAKKO-013",
          "name": "学イ1",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分の襲撃時、自分の怪異1枚のスピードを+2する",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "GAKKO-014": {
          "id": "GAKKO-014",
          "name": "学イ2",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "event",
          "cost": 0,
          "traits": [
            "学校"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、自分の人間/怪異が相手の効果によって受けるダメージを1軽減する",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "GAKKO-015": {
          "id": "GAKKO-015",
          "name": "学人1",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】この襲撃で《幽霊》の怪異から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "GAKKO-016": {
          "id": "GAKKO-016",
          "name": "学人2",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "相手の《怪物》の怪異のスピードを-1する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "GAKKO-017": {
          "id": "GAKKO-017",
          "name": "学人3",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "学校"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から3枚を見る。その中から特徴〔学校〕を持つカード1枚を手札に加えることができる。その後、残りをトラッシュに置く",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "GAKKO-018": {
          "id": "GAKKO-018",
          "name": "学人4",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "学校"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分の特徴〔学校〕を持つ怪異が相手の効果によって受けるダメージを1軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "GAKKO-019": {
          "id": "GAKKO-019",
          "name": "学人5",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "学校"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のフィールドが特徴〔学校〕を持つなら、相手の怪異1枚をトラッシュに置く",
          "baseCount": null,
          "speed": 2,
          "hp": 5
        },
        "GAKKO-020": {
          "id": "GAKKO-020",
          "name": "学怪1",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から2枚をトラッシュに置く",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "GAKKO-021": {
          "id": "GAKKO-021",
          "name": "学怪2",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で追跡している人間が《元気》なら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "GAKKO-022": {
          "id": "GAKKO-022",
          "name": "学怪3",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のトラッシュから特徴〔学校〕を持つ元のコスト1以下の怪異1枚を自分の場に出すことができる",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "GAKKO-023": {
          "id": "GAKKO-023",
          "name": "学怪4",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から2枚をトラッシュに置く",
          "baseCount": null,
          "speed": 4,
          "hp": 2
        },
        "SHOTEN-001": {
          "id": "SHOTEN-001",
          "name": "商人0",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "商店街"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "初期配置",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "SHOTEN-002": {
          "id": "SHOTEN-002",
          "name": "商人1",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "SHOTEN-003": {
          "id": "SHOTEN-003",
          "name": "商人2",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 4
        },
        "SHOTEN-004": {
          "id": "SHOTEN-004",
          "name": "商人3",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分の手札から特徴〔商店街〕を持つグッズ1枚をトラッシュに置くことができる。そうしたなら、自分は1枚ドローする",
          "baseCount": 3,
          "speed": 2,
          "hp": 4
        },
        "SHOTEN-005": {
          "id": "SHOTEN-005",
          "name": "商怪1",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 2
        },
        "SHOTEN-006": {
          "id": "SHOTEN-006",
          "name": "商怪2",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 4
        },
        "SHOTEN-007": {
          "id": "SHOTEN-007",
          "name": "商怪3",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【離れた時】このカードに装備されていたグッズを、トラッシュに置くかわりに自分の手札に加えることができる",
          "baseCount": 4,
          "speed": 2,
          "hp": 4
        },
        "SHOTEN-008": {
          "id": "SHOTEN-008",
          "name": "商グ1",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": 4,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "any",
            "trait": null,
            "name": null,
            "assumption": "EQUIP-TARGET-UNSPECIFIED"
          }
        },
        "SHOTEN-009": {
          "id": "SHOTEN-009",
          "name": "商グ3",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【離れた時】自分のデッキの上から3枚を見る。その中から特徴〔商店街〕を持つグッズ1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": 3,
          "equipBonus": {
            "hp": 1
          },
          "equipTarget": {
            "type": "any",
            "trait": null,
            "name": null,
            "assumption": "EQUIP-TARGET-UNSPECIFIED"
          }
        },
        "SHOTEN-010": {
          "id": "SHOTEN-010",
          "name": "商グ4",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "goods",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【装備時】相手の怪異1枚に1ダメージを与える",
          "baseCount": 3,
          "equipBonus": {},
          "equipTarget": {
            "type": "any",
            "trait": null,
            "name": null,
            "assumption": "EQUIP-TARGET-UNSPECIFIED"
          }
        },
        "SHOTEN-011": {
          "id": "SHOTEN-011",
          "name": "商グ2",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "goods",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【装備時】自分は1枚ドローする。その後、自分の手札1枚を捨てる",
          "baseCount": 1,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "any",
            "trait": null,
            "name": null,
            "assumption": "EQUIP-TARGET-UNSPECIFIED"
          }
        },
        "SHOTEN-012": {
          "id": "SHOTEN-012",
          "name": "商グ5",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "goods",
          "cost": 4,
          "traits": [
            "商店街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【装備時】このカードを装備しているカードが「切り札」なら、相手の怪異1枚に2ダメージを与える",
          "baseCount": 1,
          "equipBonus": {
            "speed": 1,
            "hp": 1
          },
          "equipTarget": {
            "type": "any",
            "trait": null,
            "name": null,
            "assumption": "EQUIP-TARGET-UNSPECIFIED"
          }
        },
        "SHOTEN-013": {
          "id": "SHOTEN-013",
          "name": "商イ1",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "event",
          "cost": 0,
          "traits": [
            "商店街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分の手札から特徴〔商店街〕を持つグッズを好きな枚数トラッシュに置く。その後、置いた枚数だけ自分はドローする",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "SHOTEN-014": {
          "id": "SHOTEN-014",
          "name": "商人4",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】《怪物》の怪異から襲撃を受けた時、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "SHOTEN-015": {
          "id": "SHOTEN-015",
          "name": "商人5",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から1枚を見る。それが特徴〔商店街〕を持つグッズなら、トラッシュに置くことができる",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "SHOTEN-016": {
          "id": "SHOTEN-016",
          "name": "商人6",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【離れた時】このカードに装備されていたグッズを、自分の他の特徴〔商店街〕を持つ人間/怪異1体に装備し直すことができる",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "SHOTEN-017": {
          "id": "SHOTEN-017",
          "name": "商人7",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "相手がグッズを使う時、そのコストを+1する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "SHOTEN-018": {
          "id": "SHOTEN-018",
          "name": "商人8",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "商店街"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から3枚を見る。その中から特徴〔商店街〕を持つグッズ1枚を手札に加えることができる。その後、残りをトラッシュに置く",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "SHOTEN-019": {
          "id": "SHOTEN-019",
          "name": "商人9",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "human",
          "cost": 4,
          "traits": [
            "商店街"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "このカードには、特徴〔商店街〕を持つグッズを2枚まで装備できる",
          "baseCount": null,
          "speed": 4,
          "hp": 7
        },
        "SHOTEN-020": {
          "id": "SHOTEN-020",
          "name": "商怪4",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】《クール》の人間を襲撃した時、その人間から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "SHOTEN-021": {
          "id": "SHOTEN-021",
          "name": "商怪5",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から1枚を見る。それが特徴〔商店街〕を持つグッズなら手札に加える。それ以外ならデッキの下に置く",
          "baseCount": null,
          "speed": 3,
          "hp": 1
        },
        "SHOTEN-022": {
          "id": "SHOTEN-022",
          "name": "商怪6",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "このカードにグッズが装備されているなら、このカードのスピードを+1する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "SHOTEN-023": {
          "id": "SHOTEN-023",
          "name": "商怪7",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から2枚をトラッシュに置く",
          "baseCount": null,
          "speed": 3,
          "hp": 2
        },
        "SHOTEN-024": {
          "id": "SHOTEN-024",
          "name": "商怪8",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔商店街〕を持つグッズ1枚をこのカードに装備する",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "SHOTEN-025": {
          "id": "SHOTEN-025",
          "name": "商怪9",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "自分のトラッシュにある名前の異なる特徴〔商店街〕を持つグッズ1枚につき、このカードのスピードを+1する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "SHOTEN-026": {
          "id": "SHOTEN-026",
          "name": "商グ6",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "商店街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【装備時】自分の手札から特徴〔商店街〕を持つグッズ1枚をトラッシュに置くことができる",
          "baseCount": null,
          "equipBonus": {},
          "equipTarget": {
            "type": "any",
            "trait": null,
            "name": null,
            "assumption": "EQUIP-TARGET-UNSPECIFIED"
          }
        },
        "CHIKA-001": {
          "id": "CHIKA-001",
          "name": "初期",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "地下"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "CHIKA-002": {
          "id": "CHIKA-002",
          "name": "地人1",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "地下"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 2,
          "hp": 3
        },
        "CHIKA-003": {
          "id": "CHIKA-003",
          "name": "シズ（表）",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "地下",
            "駅員"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "〔地下〕〔駅員〕｜【自分のターン開始時】自分の場に他の人間がいて、自分のトラッシュに特徴〔地下〕を持つ怪異が3枚以上あるなら、このカードを裏面に変身することができる／このカードは、裏面の怪異として手札から出すこともできる",
          "baseCount": 4,
          "speed": 2,
          "hp": 2,
          "faces": [
            "CHIKA-003",
            "CHIKA-004"
          ],
          "directPlayFaces": [
            1
          ]
        },
        "CHIKA-004": {
          "id": "CHIKA-004",
          "name": "シズ（裏）",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "地下",
            "巨人",
            "駅員"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "〔地下〕〔巨人〕〔駅員〕｜【登場時】自分のデッキの上から5枚を見る。その中から特徴〔巨人〕を持つ怪異1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": null,
          "speed": 2,
          "hp": 5,
          "faceOnly": true
        },
        "CHIKA-005": {
          "id": "CHIKA-005",
          "name": "地人2",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "地下"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 3,
          "hp": 4
        },
        "CHIKA-006": {
          "id": "CHIKA-006",
          "name": "挑発",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "地下"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分のフィールドが特徴〔地下〕を持つなら、相手の怪異は、このカード以外の自分の人間を追跡できない",
          "baseCount": 3,
          "speed": 1,
          "hp": 5
        },
        "CHIKA-007": {
          "id": "CHIKA-007",
          "name": "影1",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "地下"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 2
        },
        "CHIKA-008": {
          "id": "CHIKA-008",
          "name": "影2",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "地下"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から1枚を見る。それが特徴〔巨人〕を持つ怪異なら、手札に加えることができる。手札に加えなかったなら、デッキの下に置く",
          "baseCount": 4,
          "speed": 2,
          "hp": 2
        },
        "CHIKA-009": {
          "id": "CHIKA-009",
          "name": "影3",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "地下"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 4
        },
        "CHIKA-010": {
          "id": "CHIKA-010",
          "name": "SR巨人",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "地下",
            "巨人"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "〔地下〕〔巨人〕｜【登場時】相手の怪異すべてに3ダメージを与える",
          "baseCount": 3,
          "speed": 3,
          "hp": 9
        },
        "CHIKA-011": {
          "id": "CHIKA-011",
          "name": "コモン巨人",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "地下",
            "巨人"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "〔地下〕〔巨人〕｜相手の元のコスト2以下の怪異は追跡できない",
          "baseCount": 2,
          "speed": 2,
          "hp": 10
        },
        "CHIKA-012": {
          "id": "CHIKA-012",
          "name": "地グ2",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "goods",
          "cost": 3,
          "traits": [
            "地下"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔地下〕怪異に装備。このカードを装備している怪異が特徴〔巨人〕を持つなら、そのスピードを+2する",
          "baseCount": 2,
          "equipBonus": {
            "hp": 2
          },
          "equipTarget": {
            "type": "youkai",
            "trait": "地下",
            "name": null
          }
        },
        "CHIKA-013": {
          "id": "CHIKA-013",
          "name": "地イ",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "地下"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、自分の特徴〔地下〕を持つ人間すべての体力を+2する",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "CHIKA-014": {
          "id": "CHIKA-014",
          "name": "地人3",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "地下"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から2枚を見る。その中から特徴〔駅員〕を持つカード1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "CHIKA-015": {
          "id": "CHIKA-015",
          "name": "地人4",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "地下"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】《悪魔》の怪異から襲撃を受けた時、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "CHIKA-016": {
          "id": "CHIKA-016",
          "name": "地人5",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "地下"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】自分の場に特徴〔巨人〕を持つ怪異があるなら、この襲撃で受けるダメージを1軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "CHIKA-017": {
          "id": "CHIKA-017",
          "name": "地人6",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "地下"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分の場に特徴〔巨人〕を持つ怪異があるなら、自分は1枚ドローする。その後、自分の手札1枚をデッキの下に置く",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "CHIKA-018": {
          "id": "CHIKA-018",
          "name": "地人7",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "human",
          "cost": 4,
          "traits": [
            "地下"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔地下〕を持ち、特徴〔巨人〕を持たない怪異1枚を自分の場に出すことができる",
          "baseCount": null,
          "speed": 4,
          "hp": 7
        },
        "CHIKA-019": {
          "id": "CHIKA-019",
          "name": "地怪1",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "地下"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で追跡している人間が《怖がり》なら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "CHIKA-020": {
          "id": "CHIKA-020",
          "name": "地怪2",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "地下"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "自分の場に特徴〔巨人〕を持つ怪異があるなら、このカードのスピードと体力を+1する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "CHIKA-021": {
          "id": "CHIKA-021",
          "name": "地怪3",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "地下"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュに特徴〔地下〕を持つ怪異が3枚以上あるなら、相手の怪異1枚は、次の襲撃時にスピードを-2する",
          "baseCount": null,
          "speed": 4,
          "hp": 4
        },
        "CHIKA-022": {
          "id": "CHIKA-022",
          "name": "地怪4",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "地下",
            "巨人"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "〔巨人〕｜【登場時】相手の怪異1枚に2ダメージを与える",
          "baseCount": null,
          "speed": 4,
          "hp": 8
        },
        "CHIKA-023": {
          "id": "CHIKA-023",
          "name": "地怪5",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "地下"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から1枚を見る。それが特徴〔駅員〕を持つカードなら手札に加える。それ以外ならデッキの下に置く",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "MORI-001": {
          "id": "MORI-001",
          "name": "初期",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "森"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 3,
          "hp": 2
        },
        "MORI-002": {
          "id": "MORI-002",
          "name": "森人1",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "森"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "MORI-003": {
          "id": "MORI-003",
          "name": "森人2",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "森"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から2枚を見る。その中から特徴〔森〕を持つ人間1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "MORI-004": {
          "id": "MORI-004",
          "name": "ルピア",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "森"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "自分の手札の特徴〔森〕を持つ元のコスト8以上の人間のコストを-2する。ただし、コストは1未満にならない／【ターンに1回】【離れた時】自分の場に「トキ」があるなら、自分の気力を1回復する。この効果は重複しない",
          "baseCount": 4,
          "speed": 1,
          "hp": 4,
          "errata": "v1.1 ruling 2"
        },
        "MORI-005": {
          "id": "MORI-005",
          "name": "トキ",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "human",
          "cost": 10,
          "traits": [
            "森",
            "神域",
            "稲荷"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "〔森〕〔神域〕〔稲荷〕｜自分のロストゾーンに特徴〔森〕を持つカードが2枚あるごとに、このカードのコストを-1する／【登場時】相手の怪異すべてを相手の手札に戻す。その後、自分の「トキ」以外の人間すべてを自分の手札に戻す／相手の怪異は、場に出たターンに追跡できない／このカードがロストゾーンに置かれた時、自分はゲームに敗北する",
          "baseCount": 4,
          "speed": 5,
          "hp": 9
        },
        "MORI-006": {
          "id": "MORI-006",
          "name": "サワ",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "human",
          "cost": 8,
          "traits": [
            "森",
            "猟師"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "〔森〕〔猟師〕｜自分のロストゾーンに特徴〔森〕を持つカードが3枚以上あるなら、このカードのコストは6になる（ルピアの下限4で実質4）／【登場時】相手の怪異1枚に3ダメージを与える／【自分のターン終了時】相手の怪異1枚に1ダメージを与える",
          "baseCount": null,
          "speed": 4,
          "hp": 7
        },
        "MORI-007": {
          "id": "MORI-007",
          "name": "小獣",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 3,
          "hp": 2
        },
        "MORI-008": {
          "id": "MORI-008",
          "name": "中獣",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "MORI-009": {
          "id": "MORI-009",
          "name": "森怪3",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で相手の人間から受けるダメージを1軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 5
        },
        "MORI-010": {
          "id": "MORI-010",
          "name": "大獣",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": null,
          "speed": 3,
          "hp": 8
        },
        "MORI-011": {
          "id": "MORI-011",
          "name": "猟銃",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "goods",
          "cost": 0,
          "traits": [
            "森"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "装備できる相手：「サワ」｜このカードを装備している人間が効果によって与えるダメージを+1する",
          "baseCount": null,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "human",
            "trait": null,
            "name": "サワ"
          }
        },
        "MORI-012": {
          "id": "MORI-012",
          "name": "供物",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "event",
          "cost": 0,
          "traits": [
            "森"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分の場に人間が2枚以上あるなら、自分の特徴〔森〕を持つ人間1枚をロストゾーンに置くことができる。そうしたなら、自分の気力を2回復する",
          "baseCount": 0,
          "oncePerTurnName": true
        },
        "MORI-013": {
          "id": "MORI-013",
          "name": "森人3",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "森"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のフィールドが特徴〔森〕を持つなら、自分の気力を1回復する",
          "baseCount": null,
          "speed": 3,
          "hp": 1
        },
        "MORI-014": {
          "id": "MORI-014",
          "name": "森人4",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "森"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分の場の他の人間1枚をロストゾーンに置くことができる。そうしたなら、自分は2枚ドローする",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "MORI-015": {
          "id": "MORI-015",
          "name": "森人5",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "森"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分のロストゾーンに特徴〔森〕を持つカードが2枚あるごとに、このカードのスピードを+1する",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "MORI-016": {
          "id": "MORI-016",
          "name": "森人6",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "human",
          "cost": 4,
          "traits": [
            "森"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のロストゾーンに特徴〔森〕を持つカードが3枚以上あるなら、相手の怪異1枚に3ダメージを与える",
          "baseCount": null,
          "speed": 5,
          "hp": 3
        },
        "MORI-017": {
          "id": "MORI-017",
          "name": "森怪4",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 2,
          "hp": 3
        },
        "MORI-018": {
          "id": "MORI-018",
          "name": "森怪5",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "自分のロストゾーンに特徴〔森〕を持つカードが2枚あるごとに、このカードの体力を+1する",
          "baseCount": 4,
          "speed": 3,
          "hp": 2
        },
        "MORI-019": {
          "id": "MORI-019",
          "name": "森怪6",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から2枚を見る。その中から特徴〔森〕を持つ怪異1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": null,
          "speed": 3,
          "hp": 4
        },
        "MORI-020": {
          "id": "MORI-020",
          "name": "森怪7",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "youkai",
          "cost": 6,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "自分のロストゾーンに特徴〔森〕を持つカードが2枚あるごとに、このカードのコストを-1する。ただし、コストは1未満にならない",
          "baseCount": null,
          "speed": 3,
          "hp": 6
        },
        "MORI-021": {
          "id": "MORI-021",
          "name": "森怪8",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "自分のロストゾーンに特徴〔森〕を持つ人間が3枚以上あるなら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "MORI-022": {
          "id": "MORI-022",
          "name": "森怪9",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "森"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分の場の人間1枚をロストゾーンに置くことができる。そうしたなら、相手の怪異1枚に3ダメージを与える",
          "baseCount": 2,
          "speed": 4,
          "hp": 7
        },
        "SHIMA-001": {
          "id": "SHIMA-001",
          "name": "岩の子",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "youkai",
          "cost": 6,
          "traits": [
            "島",
            "岩"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "〔島〕〔岩〕｜【自分の襲撃時】この襲撃で相手の人間がロストゾーンに置かれたなら、気力を2支払うことができる。そうしたなら、次の面に変身する",
          "baseCount": 4,
          "speed": 3,
          "hp": 5,
          "faces": [
            "SHIMA-001",
            "SHIMA-002",
            "SHIMA-003"
          ]
        },
        "SHIMA-002": {
          "id": "SHIMA-002",
          "name": "岩場のもの",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "youkai",
          "cost": null,
          "traits": [
            "島",
            "岩"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "〔島〕〔岩〕｜【成長】【自分の襲撃時】この襲撃で相手の人間がロストゾーンに置かれたなら、気力を3支払うことができる。そうしたなら、次の面に変身する／【登場時】自分は1枚ドローする",
          "baseCount": null,
          "speed": 4,
          "hp": 6,
          "growth": true,
          "originalCostFrom": "SHIMA-001",
          "faceOnly": true
        },
        "SHIMA-003": {
          "id": "SHIMA-003",
          "name": "立つもの",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "youkai",
          "cost": null,
          "traits": [
            "島",
            "岩"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "〔島〕〔岩〕｜【成長】【登場時】相手の怪異すべてに2ダメージを与える",
          "baseCount": null,
          "speed": 6,
          "hp": 8,
          "growth": true,
          "originalCostFrom": "SHIMA-001",
          "faceOnly": true
        },
        "SHIMA-004": {
          "id": "SHIMA-004",
          "name": "初期",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "島"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "SHIMA-005": {
          "id": "SHIMA-005",
          "name": "島人1",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 2,
          "hp": 3
        },
        "SHIMA-006": {
          "id": "SHIMA-006",
          "name": "島人2",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 2
        },
        "SHIMA-007": {
          "id": "SHIMA-007",
          "name": "島人3",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "島"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 3,
          "hp": 4
        },
        "SHIMA-008": {
          "id": "SHIMA-008",
          "name": "島人4",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "島"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから「岩の子」1枚を手札に加えることができる",
          "baseCount": 3,
          "speed": 2,
          "hp": 4
        },
        "SHIMA-009": {
          "id": "SHIMA-009",
          "name": "島人5",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から3枚を見る。その中から「岩の子」1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": 4,
          "speed": 2,
          "hp": 2
        },
        "SHIMA-010": {
          "id": "SHIMA-010",
          "name": "岩グ",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "goods",
          "cost": 0,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔岩〕怪異に装備。体力+2。効果なし。",
          "baseCount": 2,
          "equipBonus": {
            "hp": 2
          },
          "equipTarget": {
            "type": "youkai",
            "trait": "岩",
            "name": null
          }
        },
        "SHIMA-011": {
          "id": "SHIMA-011",
          "name": "回復",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分の特徴〔岩〕を持つ怪異1枚が受けているダメージをすべて取り除く",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "SHIMA-012": {
          "id": "SHIMA-012",
          "name": "潮鳴り",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、自分の特徴〔岩〕を持つ怪異の追跡は外れず、追跡できない状態にもならない",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "SHIMA-013": {
          "id": "SHIMA-013",
          "name": "岩イ3",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "event",
          "cost": 0,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、自分の特徴〔岩〕を持つ怪異が相手の効果によって受けるダメージを2軽減する",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "SHIMA-014": {
          "id": "SHIMA-014",
          "name": "岩イ4",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分の襲撃時、自分の特徴〔岩〕を持つ怪異のスピードを+2する",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "SHIMA-015": {
          "id": "SHIMA-015",
          "name": "島人6",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】この襲撃で《幽霊》の怪異から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "SHIMA-016": {
          "id": "SHIMA-016",
          "name": "島人7",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "島"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分の特徴〔岩〕を持つ怪異1枚が受けているダメージを2取り除く",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "SHIMA-017": {
          "id": "SHIMA-017",
          "name": "島人8",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "島"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分の特徴〔岩〕を持つ怪異のスピードを+1する",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "SHIMA-018": {
          "id": "SHIMA-018",
          "name": "島人9",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のトラッシュから「岩の子」1枚を手札に加えることができる",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "SHIMA-019": {
          "id": "SHIMA-019",
          "name": "島人10",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "島"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分の特徴〔岩〕を持つ怪異1枚は、次の自分のターン開始時まで、相手の効果によって選ばれない",
          "baseCount": null,
          "speed": 3,
          "hp": 3
        },
        "SHIMA-020": {
          "id": "SHIMA-020",
          "name": "鎌",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔岩〕怪異に装備。【自分の襲撃時】この襲撃で相手の人間から受けるダメージを1軽減する",
          "baseCount": null,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": "岩",
            "name": null
          }
        },
        "SHIMA-021": {
          "id": "SHIMA-021",
          "name": "白い襷",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔島〕人間に装備。このカードを装備している人間が場を離れた時、自分の特徴〔岩〕を持つ怪異1枚が受けているダメージを2取り除く",
          "baseCount": null,
          "equipBonus": {},
          "equipTarget": {
            "type": "human",
            "trait": "島",
            "name": null
          }
        },
        "SHIMA-022": {
          "id": "SHIMA-022",
          "name": "呼び声",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "event",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分のトラッシュから「岩の子」1枚を手札に加える",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "SHIMA-023": {
          "id": "SHIMA-023",
          "name": "満潮",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "event",
          "cost": 2,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分の場に特徴〔岩〕を持つ怪異があるなら、相手の怪異1枚は次の相手の襲撃時に追跡できない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "SHIMA-024": {
          "id": "SHIMA-024",
          "name": "外科の湯",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "event",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分の特徴〔岩〕を持つ怪異1枚が受けているダメージをすべて取り除く。その後、次の自分のターン開始時まで、その怪異が受けるダメージを1軽減する",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "SHIMA-025": {
          "id": "SHIMA-025",
          "name": "潮止まり",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "event",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分の襲撃時、自分の特徴〔岩〕を持つ怪異が追跡している人間のスピードを-2する",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "SHIMA-026": {
          "id": "SHIMA-026",
          "name": "神事",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "pool",
          "type": "event",
          "cost": 1,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分の襲撃時、自分の特徴〔岩〕を持つ怪異が変身するために支払う気力を-2する",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "HOTEL-001": {
          "id": "HOTEL-001",
          "name": "初期",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "HOTEL-002": {
          "id": "HOTEL-002",
          "name": "ホ人1",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "HOTEL-003": {
          "id": "HOTEL-003",
          "name": "マルグリット",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から5枚を見る。その中から、【二重追跡】を持つ怪異1枚と、特徴〔ホテル〕を持つイベント1枚を、それぞれ公開し手札に加えることができる。その後、残りをランダムにデッキの下に戻す",
          "baseCount": 4,
          "speed": 2,
          "hp": 4
        },
        "HOTEL-004": {
          "id": "HOTEL-004",
          "name": "ヴィルマ",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【ターンに1回】自分のフィールドが特徴〔ホテル〕を持つなら、相手が人間を場に出した時、自分の気力を1回復する",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "HOTEL-005": {
          "id": "HOTEL-005",
          "name": "ホ人3",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 4
        },
        "HOTEL-006": {
          "id": "HOTEL-006",
          "name": "呼び鈴",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から1枚を見る。それが「支配人」なら手札に加えることができる。手札に加えなかったなら、デッキの下に置く",
          "baseCount": 4,
          "speed": 2,
          "hp": 2
        },
        "HOTEL-007": {
          "id": "HOTEL-007",
          "name": "客室係",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "ホテル"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 4
        },
        "HOTEL-008": {
          "id": "HOTEL-008",
          "name": "支配人",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "ホテル"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【二重追跡】",
          "baseCount": 4,
          "speed": 3,
          "hp": 4
        },
        "HOTEL-009": {
          "id": "HOTEL-009",
          "name": "ボイラー",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "ホテル"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【登場時】相手は自分の手札から人間1枚を選び、そのコストを支払って自分の場に出す。出せないなら、何も起こらない",
          "baseCount": 1,
          "speed": 4,
          "hp": 7
        },
        "HOTEL-010": {
          "id": "HOTEL-010",
          "name": "バフォメット",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "ホテル"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【二重追跡】／【登場時】相手は自分の手札から人間1枚を選び、コストを支払わずに自分の場に出す／相手のターン開始時に回復する気力を-1する。この効果は重複しない",
          "baseCount": 2,
          "speed": 3,
          "hp": 8
        },
        "HOTEL-011": {
          "id": "HOTEL-011",
          "name": "ご案内",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手は自分の手札から人間1枚を選び、コストを支払わずに自分の場に出す",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "HOTEL-012": {
          "id": "HOTEL-012",
          "name": "深夜営業",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分の襲撃時、自分の【二重追跡】を持つ怪異1枚のスピードを+2する",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "HOTEL-013": {
          "id": "HOTEL-013",
          "name": "ヘレナ",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から3枚を見る。その中から特徴〔ホテル〕を持つ怪異1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "HOTEL-014": {
          "id": "HOTEL-014",
          "name": "ユーディト",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【離れた時】自分は1枚ドローする",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "HOTEL-015": {
          "id": "HOTEL-015",
          "name": "ドロテア",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】この襲撃で《悪魔》の怪異から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "HOTEL-016": {
          "id": "HOTEL-016",
          "name": "アガタ",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分のフィールドが特徴〔ホテル〕を持ち、相手の場に人間が3枚あるなら、自分の気力を2回復する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "HOTEL-017": {
          "id": "HOTEL-017",
          "name": "リンデ（SR）",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "human",
          "cost": 4,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分のフィールドが特徴〔ホテル〕を持つなら、次の相手のターン、相手は追跡できない",
          "baseCount": null,
          "speed": 3,
          "hp": 6
        },
        "HOTEL-018": {
          "id": "HOTEL-018",
          "name": "ベルボーイ",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】相手は自分の手札から人間1枚を選び、コストを支払わずに自分の場に出す",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "HOTEL-019": {
          "id": "HOTEL-019",
          "name": "木彫りの偶像",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "ホテル"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "相手が人間を場に出す時、そのコストを+1する",
          "baseCount": null,
          "speed": 3,
          "hp": 4
        },
        "HOTEL-020": {
          "id": "HOTEL-020",
          "name": "グランドピアノ",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "ホテル"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【ターンに1回】相手が人間を場に出した時、自分は1枚ドローする",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "HOTEL-021": {
          "id": "HOTEL-021",
          "name": "シャンデリア",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "ホテル"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【登場時】相手の場に人間が3枚あるなら、相手の人間すべてに1ダメージを与える",
          "baseCount": null,
          "speed": 3,
          "hp": 8
        },
        "HOTEL-022": {
          "id": "HOTEL-022",
          "name": "大きな金庫",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "ホテル"
          ],
          "attribute": "悪魔",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のフィールドが特徴〔ホテル〕を持つなら、自分の気力を2回復する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "HOTEL-023": {
          "id": "HOTEL-023",
          "name": "客室の鍵",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔ホテル〕人間に装備。装備している人間が場を離れた時、フィールド〔ホテル〕なら気力1回復",
          "baseCount": null,
          "equipBonus": {
            "hp": 1
          },
          "equipTarget": {
            "type": "human",
            "trait": "ホテル",
            "name": null
          }
        },
        "HOTEL-024": {
          "id": "HOTEL-024",
          "name": "呪われた懐中時計",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "ホテル"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔ホテル〕怪異に装備。装備している怪異が【二重追跡】を持つなら、さらにスピードを+1する",
          "baseCount": null,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": "ホテル",
            "name": null
          }
        },
        "YORU-001": {
          "id": "YORU-001",
          "name": "初期",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "YORU-002": {
          "id": "YORU-002",
          "name": "街人1",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "YORU-003": {
          "id": "YORU-003",
          "name": "街人2",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 3,
          "hp": 2
        },
        "YORU-004": {
          "id": "YORU-004",
          "name": "街人3",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【ターンに1回】自分のフィールドが特徴〔夜の街〕を持つなら、相手が手札からカードを捨てた時、自分は1枚ドローする",
          "baseCount": 3,
          "speed": 2,
          "hp": 4
        },
        "YORU-005": {
          "id": "YORU-005",
          "name": "街人4",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 1,
          "speed": 3,
          "hp": 4
        },
        "YORU-006": {
          "id": "YORU-006",
          "name": "学メ1",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "相手がイベントを使った時、相手は自分の手札1枚を捨てる",
          "baseCount": 2,
          "speed": 2,
          "hp": 4
        },
        "YORU-007": {
          "id": "YORU-007",
          "name": "影の人A",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】相手は自分の手札1枚を捨てる",
          "baseCount": 3,
          "speed": 2,
          "hp": 2
        },
        "YORU-008": {
          "id": "YORU-008",
          "name": "影の人B",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】相手の手札からランダムに1枚を捨てる",
          "baseCount": 4,
          "speed": 3,
          "hp": 2
        },
        "YORU-009": {
          "id": "YORU-009",
          "name": "怪物",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "相手の手札が3枚以下なら、このカードのスピードと体力を+1する",
          "baseCount": 4,
          "speed": 3,
          "hp": 4
        },
        "YORU-010": {
          "id": "YORU-010",
          "name": "怪物（大）",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】相手の手札からランダムに1枚を捨てる。相手の手札が3枚以下なら、さらに1枚を捨てる",
          "baseCount": 1,
          "speed": 4,
          "hp": 7
        },
        "YORU-011": {
          "id": "YORU-011",
          "name": "ビルの巨人",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】相手の手札を見て、その中から1枚を捨てる／相手の手札が3枚以下なら、このカードのスピードと体力を+2する",
          "baseCount": 2,
          "speed": 4,
          "hp": 8
        },
        "YORU-012": {
          "id": "YORU-012",
          "name": "汎G1",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": 2,
          "equipBonus": {
            "hp": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": null,
            "name": null
          },
          "generic": true,
          "errata": "v1.1 ruling B"
        },
        "YORU-013": {
          "id": "YORU-013",
          "name": "霧",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "event",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の手札からランダムに2枚を捨てる",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "YORU-014": {
          "id": "YORU-014",
          "name": "輪郭",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "event",
          "cost": 0,
          "traits": [
            "夜の街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の手札を見る",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "YORU-015": {
          "id": "YORU-015",
          "name": "霧の案内人",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "全てのトラッシュのカードは、効果によってトラッシュを離れず、トラッシュから使うこともできない",
          "baseCount": null,
          "speed": 1,
          "hp": 2
        },
        "YORU-016": {
          "id": "YORU-016",
          "name": "街人5",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】この襲撃で《幽霊》の怪異から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "YORU-017": {
          "id": "YORU-017",
          "name": "街人6",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】相手の手札からランダムに1枚を捨てる",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "YORU-018": {
          "id": "YORU-018",
          "name": "街人7",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】相手の手札が3枚以下なら、自分は2枚ドローする",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "YORU-019": {
          "id": "YORU-019",
          "name": "影の人C",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【離れた時】相手は自分の手札1枚を捨てる",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "YORU-020": {
          "id": "YORU-020",
          "name": "怪物B",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "相手の手札が3枚以下なら、このカードのスピードと体力を+1する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "YORU-021": {
          "id": "YORU-021",
          "name": "街灯の下のもの",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で追跡している人間が《クール》なら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 3,
          "hp": 2
        },
        "YORU-022": {
          "id": "YORU-022",
          "name": "信号",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】相手の手札が3枚以下なら、相手の怪異1枚に2ダメージを与える",
          "baseCount": null,
          "speed": 4,
          "hp": 7
        },
        "YORU-023": {
          "id": "YORU-023",
          "name": "見下ろすもの",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "youkai",
          "cost": 6,
          "traits": [
            "夜の街"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "相手の手札上限は3枚になる／相手の手札が3枚以下なら、このカードのスピードと体力を+2する",
          "baseCount": null,
          "speed": 3,
          "hp": 8
        },
        "YORU-024": {
          "id": "YORU-024",
          "name": "街灯",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔夜の街〕人間に装備。装備している人間が場を離れた時、相手の手札からランダムに1枚を捨てる",
          "baseCount": null,
          "equipBonus": {
            "hp": 1
          },
          "equipTarget": {
            "type": "human",
            "trait": "夜の街",
            "name": null
          }
        },
        "YORU-025": {
          "id": "YORU-025",
          "name": "終電の切符",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "夜の街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔夜の街〕怪異に装備。【自分の襲撃時】この襲撃で相手の人間がロストゾーンに置かれたなら、相手は自分の手札1枚を捨てる",
          "baseCount": null,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": "夜の街",
            "name": null
          }
        },
        "YUEN-001": {
          "id": "YUEN-001",
          "name": "初期",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "遊園地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "YUEN-002": {
          "id": "YUEN-002",
          "name": "園人1",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 2,
          "hp": 3
        },
        "YUEN-003": {
          "id": "YUEN-003",
          "name": "園人2",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 3,
          "hp": 2
        },
        "YUEN-004": {
          "id": "YUEN-004",
          "name": "園人3",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "遊園地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 4
        },
        "YUEN-005": {
          "id": "YUEN-005",
          "name": "ソラ（SR）",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "human",
          "cost": 3,
          "traits": [
            "遊園地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔遊園地〕を持つイベント1枚を選ぶ。そのカードをトラッシュに残したまま、コストを支払わずに使う",
          "baseCount": 3,
          "speed": 2,
          "hp": 4
        },
        "YUEN-006": {
          "id": "YUEN-006",
          "name": "園怪1",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 2
        },
        "YUEN-007": {
          "id": "YUEN-007",
          "name": "園怪2",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "遊園地"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 3,
          "hp": 4
        },
        "YUEN-008": {
          "id": "YUEN-008",
          "name": "園怪3",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "遊園地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から3枚を見る。その中から特徴〔遊園地〕を持つイベント1枚を手札に加えることができる。残りをトラッシュに置く",
          "baseCount": 2,
          "speed": 3,
          "hp": 5
        },
        "YUEN-009": {
          "id": "YUEN-009",
          "name": "パレード",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "youkai",
          "cost": 8,
          "traits": [
            "遊園地"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "自分のトラッシュに特徴〔遊園地〕を持つイベントが2枚あるごとに、このカードのコストを-1する。ただし、コストは4未満にならない／【登場時】自分のトラッシュから特徴〔遊園地〕を持つイベントを好きな枚数選び、それらを好きな順番で、コストを支払わずに使う。こうして使ったイベントはすべて除外する。この効果で使うイベントは、【1ターン1枚】の制限を受けない",
          "baseCount": 3,
          "speed": 3,
          "hp": 6
        },
        "YUEN-010": {
          "id": "YUEN-010",
          "name": "カメラ",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔遊園地〕人間に装備。装備している人間が場を離れた時、自分のデッキの上から2枚をトラッシュに置く",
          "baseCount": 2,
          "equipBonus": {
            "hp": 1
          },
          "equipTarget": {
            "type": "human",
            "trait": "遊園地",
            "name": null
          }
        },
        "YUEN-011": {
          "id": "YUEN-011",
          "name": "園人4",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】この襲撃で《怪物》の怪異から受けるダメージを2軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "YUEN-012": {
          "id": "YUEN-012",
          "name": "園人5",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "遊園地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【登場時】自分の手札から特徴〔遊園地〕を持つイベント1枚をトラッシュに置くことができる。そうしたなら、自分は1枚ドローする",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "YUEN-013": {
          "id": "YUEN-013",
          "name": "シズカ",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "遊園地"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から3枚を見る。その中の特徴〔遊園地〕を持つイベントをすべてトラッシュに置き、残りをデッキの下に戻す",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "YUEN-014": {
          "id": "YUEN-014",
          "name": "園人7",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "遊園地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【ターンに1回】自分のフィールドが特徴〔遊園地〕を持つなら、自分がイベントを使った時、相手の怪異1枚に1ダメージを与える",
          "baseCount": null,
          "speed": 2,
          "hp": 5
        },
        "YUEN-015": {
          "id": "YUEN-015",
          "name": "園人8",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "human",
          "cost": 3,
          "traits": [
            "遊園地"
          ],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分のトラッシュに特徴〔遊園地〕を持つイベントが6枚以上あるなら、このカードのスピードと体力を+1する",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "YUEN-016": {
          "id": "YUEN-016",
          "name": "着ぐるみ",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から1枚をトラッシュに置く",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "YUEN-017": {
          "id": "YUEN-017",
          "name": "童話の人形",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "遊園地"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "自分のトラッシュに特徴〔遊園地〕を持つイベントが4枚以上あるなら、このカードのスピードと体力を+1する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "YUEN-018": {
          "id": "YUEN-018",
          "name": "木馬",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "遊園地"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で追跡している人間が《元気》なら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 3,
          "hp": 2
        },
        "YUEN-019": {
          "id": "YUEN-019",
          "name": "西部のゾンビ",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "遊園地"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から2枚をトラッシュに置く",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "YUEN-020": {
          "id": "YUEN-020",
          "name": "動物ゾンビ（獣）",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "遊園地"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】自分のトラッシュから特徴〔遊園地〕を持つイベント1枚を選ぶ。そのカードをトラッシュに残したまま、コストを支払わずに使う",
          "baseCount": null,
          "speed": 5,
          "hp": 6
        },
        "YUEN-021": {
          "id": "YUEN-021",
          "name": "入園チケット",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔遊園地〕怪異に装備。装備している怪異が場を離れた時、自分のデッキの上から2枚をトラッシュに置く",
          "baseCount": null,
          "equipBonus": {
            "speed": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": "遊園地",
            "name": null
          }
        },
        "CHOKOKU-001": {
          "id": "CHOKOKU-001",
          "name": "初期",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "human",
          "cost": 0,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし。初期配置カード。",
          "baseCount": 1,
          "speed": 2,
          "hp": 3
        },
        "CHOKOKU-002": {
          "id": "CHOKOKU-002",
          "name": "彫人1",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 4,
          "speed": 2,
          "hp": 3
        },
        "CHOKOKU-003": {
          "id": "CHOKOKU-003",
          "name": "彫人2",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "human",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 2
        },
        "CHOKOKU-004": {
          "id": "CHOKOKU-004",
          "name": "ナルミ",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "自分のフィールドのランダムな効果は、ランダムではなく自分が選んで発動する",
          "baseCount": 3,
          "speed": 2,
          "hp": 4
        },
        "CHOKOKU-005": {
          "id": "CHOKOKU-005",
          "name": "彫人4",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 3,
          "speed": 3,
          "hp": 4
        },
        "CHOKOKU-006": {
          "id": "CHOKOKU-006",
          "name": "小さな彫刻",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "youkai",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【離れた時】自分は物音を1得る",
          "baseCount": 4,
          "speed": 2,
          "hp": 2
        },
        "CHOKOKU-007": {
          "id": "CHOKOKU-007",
          "name": "動く彫刻",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "自分の物音が6以上なら、このカードのスピードと体力を+1する",
          "baseCount": 4,
          "speed": 3,
          "hp": 3
        },
        "CHOKOKU-008": {
          "id": "CHOKOKU-008",
          "name": "聞いている彫刻",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】自分は物音を1得る",
          "baseCount": 3,
          "speed": 3,
          "hp": 5
        },
        "CHOKOKU-009": {
          "id": "CHOKOKU-009",
          "name": "大きな作品",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "youkai",
          "cost": 6,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分は物音を3得る／相手が手札以外から怪異を場に出した時、その怪異に2ダメージを与える",
          "baseCount": 2,
          "speed": 4,
          "hp": 8
        },
        "CHOKOKU-010": {
          "id": "CHOKOKU-010",
          "name": "未完成の作品",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【自分のターン終了時】自分は物音を2得る",
          "baseCount": 1,
          "speed": 3,
          "hp": 8
        },
        "CHOKOKU-011": {
          "id": "CHOKOKU-011",
          "name": "足元灯",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "goods",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔彫刻公園〕怪異に装備。装備している怪異が場を離れた時、自分は物音を2得る",
          "baseCount": 2,
          "equipBonus": {
            "hp": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": "彫刻公園",
            "name": null
          }
        },
        "CHOKOKU-012": {
          "id": "CHOKOKU-012",
          "name": "足音",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分は物音を2得る",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "CHOKOKU-013": {
          "id": "CHOKOKU-013",
          "name": "静寂",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分は物音を4支払うことができる。そうしたなら、相手の怪異1枚に2ダメージを与える",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "CHOKOKU-014": {
          "id": "CHOKOKU-014",
          "name": "フミ（SR）",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分の物音が3以上なら、自分のフィールドのランダムな効果を1回発動する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "CHOKOKU-015": {
          "id": "CHOKOKU-015",
          "name": "アカリ",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【離れた時】自分は物音を2得る",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "CHOKOKU-016": {
          "id": "CHOKOKU-016",
          "name": "マキ",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "human",
          "cost": 2,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から3枚を見る。その中から特徴〔彫刻公園〕を持つ怪異1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "CHOKOKU-017": {
          "id": "CHOKOKU-017",
          "name": "ミチル",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】相手の手札を見る",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "CHOKOKU-018": {
          "id": "CHOKOKU-018",
          "name": "サヤカ",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】《怪物》の怪異から襲撃を受けた時、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "CHOKOKU-019": {
          "id": "CHOKOKU-019",
          "name": "布を掛けられた彫刻",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【登場時】自分のフィールドが特徴〔彫刻公園〕を持ち、自分の物音が6以上なら、相手の怪異1枚の追跡を解除する",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "CHOKOKU-020": {
          "id": "CHOKOKU-020",
          "name": "壁の作品",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "youkai",
          "cost": 4,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【相手のターン終了時】自分は物音を1得る",
          "baseCount": null,
          "speed": 2,
          "hp": 9
        },
        "CHOKOKU-021": {
          "id": "CHOKOKU-021",
          "name": "人と獣",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "youkai",
          "cost": 2,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で追跡している人間が《怖がり》なら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 3,
          "hp": 2
        },
        "CHOKOKU-022": {
          "id": "CHOKOKU-022",
          "name": "人と機械",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "youkai",
          "cost": 3,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "自分の物音が9以上なら、このカードのスピードを+2する",
          "baseCount": null,
          "speed": 3,
          "hp": 5
        },
        "CHOKOKU-023": {
          "id": "CHOKOKU-023",
          "name": "抽象の塊",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "youkai",
          "cost": 8,
          "traits": [
            "彫刻公園"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "相手は、手札以外から人間/怪異を場に出せない／自分の物音が9以上なら、このカードのスピードと体力を+2する",
          "baseCount": null,
          "speed": 4,
          "hp": 12
        },
        "CHOKOKU-024": {
          "id": "CHOKOKU-024",
          "name": "パンフレット",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "goods",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "〔彫刻公園〕人間に装備・補正なし。装備している人間が場を離れた時、自分のフィールドのランダムな効果を1回発動する",
          "baseCount": null,
          "equipBonus": {},
          "equipTarget": {
            "type": "human",
            "trait": "彫刻公園",
            "name": null
          }
        },
        "CHOKOKU-025": {
          "id": "CHOKOKU-025",
          "name": "木霊",
          "faction": "CHOKOKU",
          "deck": "彫刻公園",
          "pool": "pool",
          "type": "event",
          "cost": 1,
          "traits": [
            "彫刻公園"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、相手がカードを使うか追跡を宣言するたび、自分はさらに物音を1得る",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "COMMON-001": {
          "id": "COMMON-001",
          "name": "汎G1",
          "faction": "COMMON",
          "deck": "共通",
          "pool": "generic",
          "type": "goods",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": null,
          "equipBonus": {
            "hp": 1
          },
          "equipTarget": {
            "type": "youkai",
            "trait": null,
            "name": null
          },
          "generic": true
        },
        "COMMON-002": {
          "id": "COMMON-002",
          "name": "汎G2",
          "faction": "COMMON",
          "deck": "共通",
          "pool": "generic",
          "type": "goods",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "このカードを装備している人間は、相手の効果によって選ばれない",
          "baseCount": null,
          "equipBonus": {},
          "equipTarget": {
            "type": "human",
            "trait": null,
            "name": null
          }
        },
        "COMMON-003": {
          "id": "COMMON-003",
          "name": "汎G3",
          "faction": "COMMON",
          "deck": "共通",
          "pool": "generic",
          "type": "goods",
          "cost": 2,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "効果なし",
          "baseCount": null,
          "equipBonus": {
            "hp": 2
          },
          "equipTarget": {
            "type": "human",
            "trait": null,
            "name": null
          },
          "generic": true
        },
        "COMMON-004": {
          "id": "COMMON-004",
          "name": "確定除去（名前未定・通称「業火拳銃」）",
          "faction": "COMMON",
          "deck": "共通",
          "pool": "generic",
          "type": "event",
          "cost": 3,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "相手の怪異1枚を選び、相手のデッキの下に置く",
          "baseCount": null,
          "oncePerTurnName": false
        },
        "GEN2-001": {
          "id": "GEN2-001",
          "name": "追跡課税",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "human",
          "cost": 3,
          "traits": [],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "相手が追跡を宣言した時、相手は気力を1失う",
          "baseCount": null,
          "speed": 2,
          "hp": 5
        },
        "GEN2-002": {
          "id": "GEN2-002",
          "name": "怪異課税",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "human",
          "cost": 3,
          "traits": [],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "相手が怪異を場に出す時、そのコストを+1する",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "GEN2-003": {
          "id": "GEN2-003",
          "name": "大型課税",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "human",
          "cost": 2,
          "traits": [],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "相手が元のコスト4以上のカードを使った時、相手は自分の手札1枚を捨てる",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "GEN2-004": {
          "id": "GEN2-004",
          "name": "踏み倒し課税",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "youkai",
          "cost": 2,
          "traits": [],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "相手が手札以外から人間/怪異を場に出す時、相手は気力を2支払う",
          "baseCount": null,
          "speed": 2,
          "hp": 4
        },
        "GEN2-005": {
          "id": "GEN2-005",
          "name": "ドロー封じ",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "human",
          "cost": 1,
          "traits": [],
          "attribute": "怖がり",
          "attributeProvisional": true,
          "effect": "全てのプレイヤーは、効果によってカードを引けない",
          "baseCount": null,
          "speed": 1,
          "hp": 2
        },
        "GEN2-006": {
          "id": "GEN2-006",
          "name": "全体耐性",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "human",
          "cost": 3,
          "traits": [],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分の怪異は、対象を選ばない相手の効果によってダメージを受けない",
          "baseCount": null,
          "speed": 2,
          "hp": 5
        },
        "GEN2-007": {
          "id": "GEN2-007",
          "name": "追跡耐性（常在）",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "human",
          "cost": 3,
          "traits": [],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分の怪異の追跡は外れず、追跡できない状態にもならない",
          "baseCount": null,
          "speed": 2,
          "hp": 5
        },
        "GEN2-008": {
          "id": "GEN2-008",
          "name": "反射軽減（常在）",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "human",
          "cost": 2,
          "traits": [],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "自分の怪異が相手の人間から受けるダメージを1軽減する",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "GEN2-009": {
          "id": "GEN2-009",
          "name": "バウンス持ち",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "youkai",
          "cost": 5,
          "traits": [],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】相手の怪異1枚を相手の手札に戻す",
          "baseCount": null,
          "speed": 4,
          "hp": 7
        },
        "GEN2-010": {
          "id": "GEN2-010",
          "name": "狩人",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "youkai",
          "cost": 6,
          "traits": [],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【自分の襲撃時】この襲撃で相手の人間がロストゾーンに置かれたなら、相手の怪異1枚に2ダメージを与える",
          "baseCount": null,
          "speed": 5,
          "hp": 8
        },
        "GEN2-011": {
          "id": "GEN2-011",
          "name": "食らう壁",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "human",
          "cost": 7,
          "traits": [],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】このカードを襲撃した怪異を、この襲撃の後、相手のデッキの下に置く",
          "baseCount": null,
          "speed": 3,
          "hp": 8
        },
        "GEN2-012": {
          "id": "GEN2-012",
          "name": "イベントロック",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "youkai",
          "cost": 8,
          "traits": [],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "相手はイベントを使えない／自分の場に人間が3枚あるなら、このカードのスピードと体力を+2する",
          "baseCount": null,
          "speed": 4,
          "hp": 12
        },
        "GEN2-013": {
          "id": "GEN2-013",
          "name": "グッズ破壊",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "event",
          "cost": 0,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手のグッズ1枚を選び、相手のデッキの下に置く",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN2-014": {
          "id": "GEN2-014",
          "name": "イベントロック（1ターン）",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "event",
          "cost": 2,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、相手はイベントを使えない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN2-015": {
          "id": "GEN2-015",
          "name": "業火・小",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "event",
          "cost": 2,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の元のコスト3以下の怪異1枚を選び、相手のデッキの下に置く",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN2-016": {
          "id": "GEN2-016",
          "name": "業火・戻し",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "event",
          "cost": 2,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の怪異1枚を選び、相手の手札に戻す",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN2-017": {
          "id": "GEN2-017",
          "name": "業火・除外",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "event",
          "cost": 4,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の怪異1枚を選び、除外する",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN2-018": {
          "id": "GEN2-018",
          "name": "業火・二体",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "event",
          "cost": 6,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の怪異を2枚まで選び、相手のデッキの下に置く",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN2-019": {
          "id": "GEN2-019",
          "name": "山上を見る",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "event",
          "cost": 0,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分のデッキの上から1枚を見て、上か下に戻す。その後、自分は1枚ドローする",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN2-020": {
          "id": "GEN2-020",
          "name": "吸血",
          "faction": "GEN2",
          "deck": "汎用2弾",
          "pool": "generic",
          "type": "goods",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "怪異に装備・補正なし。【自分の襲撃時】この襲撃で相手の人間がロストゾーンに置かれたなら、このカードを装備している怪異が受けているダメージをすべて取り除く",
          "baseCount": null,
          "equipBonus": {},
          "equipTarget": {
            "type": "youkai",
            "trait": null,
            "name": null
          }
        },
        "GEN3-001": {
          "id": "GEN3-001",
          "name": "結界",
          "faction": "GEN3",
          "deck": "汎用3弾",
          "pool": "generic",
          "type": "event",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、自分の怪異1枚は相手の効果によって場を離れない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN3-002": {
          "id": "GEN3-002",
          "name": "霧隠れ",
          "faction": "GEN3",
          "deck": "汎用3弾",
          "pool": "generic",
          "type": "event",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、自分の怪異1枚は相手の効果によって選ばれない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN3-003": {
          "id": "GEN3-003",
          "name": "追い風",
          "faction": "GEN3",
          "deck": "汎用3弾",
          "pool": "generic",
          "type": "event",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分の襲撃時、自分の怪異すべてのスピードを+1する",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN3-004": {
          "id": "GEN3-004",
          "name": "足止め",
          "faction": "GEN3",
          "deck": "汎用3弾",
          "pool": "generic",
          "type": "event",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の相手の襲撃時、相手の怪異1枚のスピードを-2する",
          "baseCount": 3,
          "oncePerTurnName": true
        },
        "GEN3-005": {
          "id": "GEN3-005",
          "name": "反撃の構え",
          "faction": "GEN3",
          "deck": "汎用3弾",
          "pool": "generic",
          "type": "event",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の相手の襲撃時、自分の人間すべてのスピードを+1する",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN3-006": {
          "id": "GEN3-006",
          "name": "静かな夜",
          "faction": "GEN3",
          "deck": "汎用3弾",
          "pool": "generic",
          "type": "event",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、相手は効果によってカードを引けない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN3-007": {
          "id": "GEN3-007",
          "name": "通行止め",
          "faction": "GEN3",
          "deck": "汎用3弾",
          "pool": "generic",
          "type": "event",
          "cost": 2,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、相手は手札以外から人間/怪異を場に出せない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN3-008": {
          "id": "GEN3-008",
          "name": "早じまい",
          "faction": "GEN3",
          "deck": "汎用3弾",
          "pool": "generic",
          "type": "event",
          "cost": 2,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、相手はグッズを使えない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN4-001": {
          "id": "GEN4-001",
          "name": "墓地メタの肉体版",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "youkai",
          "cost": 2,
          "traits": [],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "【登場時】自分または相手のトラッシュからカードを2枚まで選び、そのカードの持ち主のデッキの下に置く",
          "baseCount": null,
          "speed": 2,
          "hp": 3
        },
        "GEN4-002": {
          "id": "GEN4-002",
          "name": "コスト宣言",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "event",
          "cost": 2,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】元のコストを1つ宣言する。次の自分のターン開始時まで、相手は宣言した元のコストのカードを使えない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN4-003": {
          "id": "GEN4-003",
          "name": "気力凍結",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "event",
          "cost": 1,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の気力を2凍結する。凍結した気力は、次の相手のターン終了時まで使えない",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN4-004": {
          "id": "GEN4-004",
          "name": "人間バウンス",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "event",
          "cost": 2,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の場に人間が2枚以上あるなら、相手の人間1枚を選び、相手の手札に戻す",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN4-005": {
          "id": "GEN4-005",
          "name": "手札リセット",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "event",
          "cost": 3,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】お互いは自分の手札をすべてデッキの下に置き、その後5枚ドローする",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN4-006": {
          "id": "GEN4-006",
          "name": "盤面リセット",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "event",
          "cost": 4,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】お互いの怪異をすべて持ち主の手札に戻す",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN4-007": {
          "id": "GEN4-007",
          "name": "トラッシュリセット",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "event",
          "cost": 3,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】お互いのトラッシュのカードをすべて持ち主のデッキの下に置く",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GEN4-008": {
          "id": "GEN4-008",
          "name": "気力リセット",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "event",
          "cost": 3,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【ゲーム中に1回】お互いの気力を0にする",
          "baseCount": null,
          "oncePerTurnName": false
        },
        "GEN4-009": {
          "id": "GEN4-009",
          "name": "敗北置換",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "human",
          "cost": 5,
          "traits": [],
          "attribute": "元気",
          "attributeProvisional": true,
          "effect": "【ゲーム中に1回】自分のロストゾーンにカードが置かれてゲームに敗北する時、代わりに自分のロストゾーンから元のコスト1以上のカード1枚を自分のトラッシュに置く",
          "baseCount": null,
          "speed": 3,
          "hp": 6
        },
        "GEN4-010": {
          "id": "GEN4-010",
          "name": "宵闇",
          "faction": "GEN4",
          "deck": "汎用4弾",
          "pool": "generic",
          "type": "event",
          "cost": 3,
          "traits": [],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、相手の手札上限は3枚になる",
          "baseCount": null,
          "oncePerTurnName": true
        },
        "GAKKO-024": {
          "id": "GAKKO-024",
          "name": "切り札2",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "学校"
          ],
          "attribute": "幽霊",
          "attributeProvisional": true,
          "effect": "自分のトラッシュに特徴〔学校〕を持つ元のコスト1以下の怪異が1枚あるごとに、このカードのコストを-1する。ただし、コストは1未満にならない／【ターンに1回】自分は、自分のトラッシュから特徴〔学校〕を持つコスト1以下の怪異1枚を、そのコストを支払って自分の場に出すことができる／【登場時】【ゲーム中に1回】相手の怪異1枚の追跡を解除する",
          "baseCount": 2,
          "speed": 3,
          "hp": 6
        },
        "YUEN-022": {
          "id": "YUEN-022",
          "name": "風船",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、自分の人間/怪異が相手の効果によって受けるダメージを1軽減する",
          "baseCount": 1,
          "oncePerTurnName": true
        },
        "YUEN-023": {
          "id": "YUEN-023",
          "name": "綿あめ",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分のターン開始時まで、自分の人間1枚の体力を+1する",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "YUEN-024": {
          "id": "YUEN-024",
          "name": "メリーゴーラウンド",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】次の自分の襲撃時、自分の怪異1枚のスピードを+1する",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "YUEN-025": {
          "id": "YUEN-025",
          "name": "コーヒーカップ",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の怪異1枚のスピードを、次の相手の襲撃時まで-1する",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "YUEN-026": {
          "id": "YUEN-026",
          "name": "案内図",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分のデッキの上から2枚を見る。1枚を手札に加え、残りをトラッシュに置く",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "YUEN-027": {
          "id": "YUEN-027",
          "name": "写真館",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分の手札から特徴〔遊園地〕を持つイベント1枚をトラッシュに置く",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "YUEN-028": {
          "id": "YUEN-028",
          "name": "花火",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 3,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手の怪異すべてに2ダメージを与える",
          "baseCount": 1,
          "oncePerTurnName": true
        },
        "YUEN-029": {
          "id": "YUEN-029",
          "name": "閉園時間",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 3,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】相手の怪異すべての追跡を解除する。それらは、次の相手の襲撃時に追跡できない",
          "baseCount": 1,
          "oncePerTurnName": true
        },
        "YUEN-030": {
          "id": "YUEN-030",
          "name": "ナイトサファリ",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 4,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分のトラッシュから特徴〔遊園地〕を持つ元のコスト5以下の怪異1枚を自分の場に出す",
          "baseCount": 1,
          "oncePerTurnName": true
        },
        "YUEN-031": {
          "id": "YUEN-031",
          "name": "見晴らし",
          "faction": "YUEN",
          "deck": "遊園地",
          "pool": "base",
          "type": "event",
          "cost": 1,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【1ターン1枚】自分のデッキの上から1枚を見て、上か下に戻す。",
          "baseCount": 2,
          "oncePerTurnName": true
        },
        "SHOTEN-027": {
          "id": "SHOTEN-027",
          "name": "商店街の切り札（名前未定）",
          "faction": "SHOTEN",
          "deck": "商店街",
          "pool": "base",
          "type": "youkai",
          "cost": 5,
          "traits": [
            "商店街"
          ],
          "attribute": "怪物",
          "attributeProvisional": true,
          "effect": "このカードには、名前の異なる特徴〔商店街〕を持つグッズを何枚でも装備できる／【登場時】自分のトラッシュから特徴〔商店街〕を持つグッズを好きな枚数、このカードに装備することができる",
          "baseCount": 2,
          "speed": 3,
          "hp": 4
        },
        "MORI-023": {
          "id": "MORI-023",
          "name": "森人7",
          "faction": "MORI",
          "deck": "森",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "森"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分のデッキの上から5枚を見る。その中から「トキ」または「サワ」1枚と、特徴〔森〕を持つ人間/怪異1枚を、それぞれ公開し手札に加えることができる。その後、残りをランダムにデッキの下に戻す",
          "baseCount": 4,
          "speed": 2,
          "hp": 4
        },
        "MORI-024": {
          "id": "MORI-024",
          "name": "森人8",
          "faction": "MORI",
          "deck": "森",
          "pool": "pool",
          "type": "human",
          "cost": 1,
          "traits": [
            "森"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【離れた時】自分のデッキの上から3枚を見る。その中から人間1枚を手札に加えることができる。残りをデッキの下に戻す",
          "baseCount": null,
          "speed": 2,
          "hp": 2
        },
        "GAKKO-025": {
          "id": "GAKKO-025",
          "name": "学人6",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "学校"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】相手の怪異1枚は、次の襲撃時にスピードを-2する",
          "baseCount": 2,
          "speed": 2,
          "hp": 4
        },
        "GAKKO-026": {
          "id": "GAKKO-026",
          "name": "学人7",
          "faction": "GAKKO",
          "deck": "学校",
          "pool": "base",
          "type": "human",
          "cost": 3,
          "traits": [
            "学校"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 2,
          "speed": 2,
          "hp": 6
        },
        "SHIMA-027": {
          "id": "SHIMA-027",
          "name": "島人11",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "島"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】次の相手のターン終了時まで、このカードが受けるダメージを3軽減する",
          "baseCount": 2,
          "speed": 2,
          "hp": 4
        },
        "SHIMA-028": {
          "id": "SHIMA-028",
          "name": "島人12",
          "faction": "SHIMA",
          "deck": "島",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "島"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】相手の怪異1枚は、次の襲撃時にスピードを-2する",
          "baseCount": 2,
          "speed": 2,
          "hp": 4
        },
        "CHIKA-024": {
          "id": "CHIKA-024",
          "name": "地人8",
          "faction": "CHIKA",
          "deck": "地下",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "地下"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】自分のフィールドが特徴〔地下〕を持つなら、相手の怪異1枚の追跡を解除する",
          "baseCount": 2,
          "speed": 2,
          "hp": 4
        },
        "HOTEL-025": {
          "id": "HOTEL-025",
          "name": "ホ人5",
          "faction": "HOTEL",
          "deck": "ホテル",
          "pool": "base",
          "type": "human",
          "cost": 3,
          "traits": [
            "ホテル"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "効果なし",
          "baseCount": 0,
          "speed": 2,
          "hp": 6
        },
        "YORU-026": {
          "id": "YORU-026",
          "name": "街人8",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【相手の襲撃時】このカードを襲撃した怪異に2ダメージを与える",
          "baseCount": 2,
          "speed": 2,
          "hp": 4
        },
        "YORU-027": {
          "id": "YORU-027",
          "name": "街人9",
          "faction": "YORU",
          "deck": "夜の街",
          "pool": "base",
          "type": "human",
          "cost": 2,
          "traits": [
            "夜の街"
          ],
          "attribute": "クール",
          "attributeProvisional": true,
          "effect": "【登場時】相手の手札が3枚以下なら、相手の怪異1枚に1ダメージを与える",
          "baseCount": 2,
          "speed": 2,
          "hp": 4
        },
        "FIELD-MURA": {
          "id": "FIELD-MURA",
          "name": "～ヨマモリ村～",
          "faction": "MURA",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "村",
            "自然",
            "信仰"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【自分のターン終了時】自分のデッキの上から1枚をトラッシュに置くことができる。",
          "lostLimit": 4,
          "baseCount": null
        },
        "FIELD-YAKATA": {
          "id": "FIELD-YAKATA",
          "name": "～黒薔薇の館～",
          "faction": "YAKATA",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "洋館",
            "悪魔",
            "迷子"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "自分のロストゾーンに3枚目のカードが置かれた時、自分のロストゾーンに特徴〔洋館〕を持つカードが3枚以上あるなら、自分の気力を1回復する。",
          "lostLimit": 4,
          "baseCount": null
        },
        "FIELD-DANCHI": {
          "id": "FIELD-DANCHI",
          "name": "～ループ団地～",
          "faction": "DANCHI",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "団地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "自分の場に怪異が2枚以上あるなら、自分の特徴〔団地〕を持つ元のコスト1以下の怪異すべてのスピードを+1する。",
          "lostLimit": 4,
          "baseCount": null
        },
        "FIELD-GAKKO": {
          "id": "FIELD-GAKKO",
          "name": "～学校～",
          "faction": "GAKKO",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "学校"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【ターンに1回】自分の特徴〔学校〕を持つ怪異が場を離れた時、自分は1枚ドローすることができる。そうしたなら、自分の手札1枚をデッキの下に置く。",
          "lostLimit": 4,
          "baseCount": null
        },
        "FIELD-SHOTEN": {
          "id": "FIELD-SHOTEN",
          "name": "～商店街～",
          "faction": "SHOTEN",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "商店街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "自分がこのターン初めて使うグッズのコストを-1する。／【ターンに1回】自分がグッズを使った時、自分は1枚ドローする。",
          "lostLimit": 5,
          "baseCount": null
        },
        "FIELD-CHIKA": {
          "id": "FIELD-CHIKA",
          "name": "～地下～",
          "faction": "CHIKA",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "地下"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "自分の場に特徴〔巨人〕を持つ怪異があるなら、自分がこのターン初めて使う特徴〔地下〕を持つカードのコストを-2する。ただし、コストは1未満にならない。",
          "lostLimit": 5,
          "baseCount": null
        },
        "FIELD-MORI": {
          "id": "FIELD-MORI",
          "name": "～禁足の森～",
          "faction": "MORI",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "森"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "自分のロストゾーンに特徴〔森〕を持つカードが4枚以上あるなら、自分の特徴〔森〕を持つ怪異のスピードを+2する。",
          "lostLimit": 5,
          "baseCount": null
        },
        "FIELD-SHIMA": {
          "id": "FIELD-SHIMA",
          "name": "～島～",
          "faction": "SHIMA",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "島"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "自分は、特徴〔岩〕を持たない怪異を場に出せない。／【自分のターン開始時】自分の場に怪異がいないなら、自分の手札から「岩の子」1枚を、コストを支払わずに自分の場に出すことができる。",
          "lostLimit": 5,
          "baseCount": null
        },
        "FIELD-HOTEL": {
          "id": "FIELD-HOTEL",
          "name": "～雪山ホテル～",
          "faction": "HOTEL",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "ホテル"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "【ターンに1回】自分の場に【二重追跡】を持つ怪異があるなら、自分の特徴〔ホテル〕を持つイベントのコストを-1する。",
          "lostLimit": 5,
          "baseCount": null,
          "errata": "v1.1 ruling 6"
        },
        "FIELD-YORU": {
          "id": "FIELD-YORU",
          "name": "～夜の街～",
          "faction": "YORU",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "夜の街"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "相手の手札が3枚以下なら、自分の特徴〔夜の街〕を持つ怪異は、相手の効果によって選ばれない。",
          "lostLimit": 5,
          "baseCount": null
        },
        "FIELD-YUEN": {
          "id": "FIELD-YUEN",
          "name": "～遊園地～",
          "faction": "YUEN",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "遊園地"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "自分の特徴〔遊園地〕を持つイベントのコストを-1する。／自分の手札が5枚以下なら、自分が特徴〔遊園地〕を持つイベントを使った時、自分は1枚ドローする。",
          "lostLimit": 5,
          "baseCount": null,
          "errata": "v1.1 ruling 5"
        },
        "FIELD-CHOKOKU": {
          "id": "FIELD-CHOKOKU",
          "name": "～彫刻公園～",
          "faction": "CHOKOKU",
          "deck": null,
          "pool": "field",
          "type": "field",
          "cost": null,
          "traits": [
            "彫刻公園"
          ],
          "attribute": null,
          "attributeProvisional": false,
          "effect": "相手がカードを使うか追跡を宣言した時、自分は物音を1得る。／物音を4得るごとに、ランダムな効果が発動する。物音が多いほど、効果が変化する。",
          "lostLimit": 5,
          "baseCount": null
        }
      };
      var DECKS_GD1 = {
        "gd1-mura": {
          "label": "村",
          "no": 1,
          "fieldId": "FIELD-MURA",
          "initialHuman": "MURA-001",
          "mainDeck": [
            {
              "id": "MURA-001",
              "count": 1
            },
            {
              "id": "MURA-002",
              "count": 3
            },
            {
              "id": "MURA-003",
              "count": 4
            },
            {
              "id": "MURA-004",
              "count": 3
            },
            {
              "id": "MURA-005",
              "count": 3
            },
            {
              "id": "MURA-006",
              "count": 4
            },
            {
              "id": "MURA-007",
              "count": 4
            },
            {
              "id": "MURA-008",
              "count": 4
            },
            {
              "id": "MURA-009",
              "count": 3
            },
            {
              "id": "MURA-010",
              "count": 3
            },
            {
              "id": "MURA-011",
              "count": 2
            },
            {
              "id": "MURA-013",
              "count": 3
            },
            {
              "id": "MURA-012",
              "count": 3
            }
          ],
          "side": "gd1-mura",
          "shortLabel": "村"
        },
        "gd1-danchi": {
          "label": "ループ団地",
          "no": 2,
          "fieldId": "FIELD-DANCHI",
          "initialHuman": "DANCHI-001",
          "mainDeck": [
            {
              "id": "DANCHI-001",
              "count": 1
            },
            {
              "id": "DANCHI-002",
              "count": 3
            },
            {
              "id": "DANCHI-003",
              "count": 3
            },
            {
              "id": "DANCHI-004",
              "count": 3
            },
            {
              "id": "DANCHI-005",
              "count": 4
            },
            {
              "id": "DANCHI-006",
              "count": 4
            },
            {
              "id": "DANCHI-007",
              "count": 4
            },
            {
              "id": "DANCHI-008",
              "count": 4
            },
            {
              "id": "DANCHI-009",
              "count": 4
            },
            {
              "id": "DANCHI-010",
              "count": 3
            },
            {
              "id": "DANCHI-011",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "DANCHI-012",
              "count": 2
            }
          ],
          "side": "gd1-danchi",
          "shortLabel": "ループ団地"
        },
        "gd1-gakko": {
          "label": "学校",
          "no": 3,
          "fieldId": "FIELD-GAKKO",
          "initialHuman": "GAKKO-001",
          "mainDeck": [
            {
              "id": "GAKKO-001",
              "count": 1
            },
            {
              "id": "GAKKO-002",
              "count": 2
            },
            {
              "id": "GAKKO-003",
              "count": 1
            },
            {
              "id": "GAKKO-004",
              "count": 4
            },
            {
              "id": "GAKKO-005",
              "count": 3
            },
            {
              "id": "GAKKO-025",
              "count": 2
            },
            {
              "id": "GAKKO-026",
              "count": 2
            },
            {
              "id": "GAKKO-006",
              "count": 2
            },
            {
              "id": "GAKKO-007",
              "count": 4
            },
            {
              "id": "GAKKO-008",
              "count": 4
            },
            {
              "id": "GAKKO-009",
              "count": 2
            },
            {
              "id": "GAKKO-024",
              "count": 2
            },
            {
              "id": "GAKKO-010",
              "count": 4
            },
            {
              "id": "GAKKO-011",
              "count": 1
            },
            {
              "id": "GAKKO-012",
              "count": 2
            },
            {
              "id": "GAKKO-014",
              "count": 2
            },
            {
              "id": "GAKKO-013",
              "count": 2
            }
          ],
          "side": "gd1-gakko",
          "shortLabel": "学校"
        },
        "gd1-shoten": {
          "label": "商店街",
          "no": 4,
          "fieldId": "FIELD-SHOTEN",
          "initialHuman": "SHOTEN-001",
          "mainDeck": [
            {
              "id": "SHOTEN-001",
              "count": 1
            },
            {
              "id": "SHOTEN-002",
              "count": 3
            },
            {
              "id": "SHOTEN-003",
              "count": 4
            },
            {
              "id": "SHOTEN-004",
              "count": 3
            },
            {
              "id": "SHOTEN-005",
              "count": 4
            },
            {
              "id": "SHOTEN-006",
              "count": 4
            },
            {
              "id": "SHOTEN-007",
              "count": 4
            },
            {
              "id": "SHOTEN-027",
              "count": 2
            },
            {
              "id": "SHOTEN-008",
              "count": 4
            },
            {
              "id": "SHOTEN-009",
              "count": 3
            },
            {
              "id": "SHOTEN-010",
              "count": 3
            },
            {
              "id": "SHOTEN-011",
              "count": 1
            },
            {
              "id": "SHOTEN-012",
              "count": 1
            },
            {
              "id": "SHOTEN-013",
              "count": 3
            }
          ],
          "side": "gd1-shoten",
          "shortLabel": "商店街"
        },
        "gd1-chika": {
          "label": "地下",
          "no": 5,
          "fieldId": "FIELD-CHIKA",
          "initialHuman": "CHIKA-001",
          "mainDeck": [
            {
              "id": "CHIKA-001",
              "count": 1
            },
            {
              "id": "CHIKA-002",
              "count": 2
            },
            {
              "id": "CHIKA-003",
              "count": 4
            },
            {
              "id": "CHIKA-005",
              "count": 2
            },
            {
              "id": "CHIKA-006",
              "count": 3
            },
            {
              "id": "CHIKA-024",
              "count": 2
            },
            {
              "id": "CHIKA-007",
              "count": 4
            },
            {
              "id": "CHIKA-008",
              "count": 4
            },
            {
              "id": "CHIKA-009",
              "count": 3
            },
            {
              "id": "CHIKA-010",
              "count": 3
            },
            {
              "id": "CHIKA-011",
              "count": 2
            },
            {
              "id": "COMMON-003",
              "count": 2
            },
            {
              "id": "CHIKA-012",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "CHIKA-013",
              "count": 3
            }
          ],
          "side": "gd1-chika",
          "shortLabel": "地下"
        },
        "gd1-mori-a": {
          "label": "森（トキ型）",
          "no": 6,
          "fieldId": "FIELD-MORI",
          "initialHuman": "MORI-001",
          "mainDeck": [
            {
              "id": "MORI-001",
              "count": 1
            },
            {
              "id": "MORI-002",
              "count": 3
            },
            {
              "id": "MORI-004",
              "count": 4
            },
            {
              "id": "MORI-023",
              "count": 4
            },
            {
              "id": "MORI-005",
              "count": 4
            },
            {
              "id": "MORI-007",
              "count": 4
            },
            {
              "id": "MORI-017",
              "count": 4
            },
            {
              "id": "MORI-018",
              "count": 4
            },
            {
              "id": "MURA-010",
              "count": 4
            },
            {
              "id": "COMMON-003",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "GEN3-004",
              "count": 3
            }
          ],
          "side": "gd1-mori-a",
          "shortLabel": "森（トキ型）"
        },
        "gd1-shima": {
          "label": "島",
          "no": 9,
          "fieldId": "FIELD-SHIMA",
          "initialHuman": "SHIMA-004",
          "mainDeck": [
            {
              "id": "SHIMA-004",
              "count": 1
            },
            {
              "id": "SHIMA-005",
              "count": 2
            },
            {
              "id": "SHIMA-006",
              "count": 3
            },
            {
              "id": "SHIMA-009",
              "count": 4
            },
            {
              "id": "SHIMA-007",
              "count": 2
            },
            {
              "id": "SHIMA-008",
              "count": 3
            },
            {
              "id": "SHIMA-027",
              "count": 2
            },
            {
              "id": "SHIMA-028",
              "count": 2
            },
            {
              "id": "SHIMA-001",
              "count": 4
            },
            {
              "id": "SHIMA-010",
              "count": 2
            },
            {
              "id": "MURA-010",
              "count": 2
            },
            {
              "id": "SHIMA-013",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "SHIMA-011",
              "count": 3
            },
            {
              "id": "SHIMA-012",
              "count": 3
            },
            {
              "id": "SHIMA-014",
              "count": 2
            }
          ],
          "side": "gd1-shima",
          "shortLabel": "島"
        },
        "gd1-hotel-a": {
          "label": "ホテル①（支配人型）",
          "no": 10,
          "fieldId": "FIELD-HOTEL",
          "initialHuman": "HOTEL-001",
          "mainDeck": [
            {
              "id": "HOTEL-001",
              "count": 1
            },
            {
              "id": "HOTEL-002",
              "count": 3
            },
            {
              "id": "HOTEL-003",
              "count": 4
            },
            {
              "id": "HOTEL-004",
              "count": 3
            },
            {
              "id": "HOTEL-005",
              "count": 3
            },
            {
              "id": "HOTEL-006",
              "count": 4
            },
            {
              "id": "HOTEL-007",
              "count": 3
            },
            {
              "id": "HOTEL-008",
              "count": 4
            },
            {
              "id": "HOTEL-009",
              "count": 1
            },
            {
              "id": "HOTEL-010",
              "count": 2
            },
            {
              "id": "MURA-010",
              "count": 2
            },
            {
              "id": "COMMON-003",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "HOTEL-011",
              "count": 3
            },
            {
              "id": "HOTEL-012",
              "count": 2
            }
          ],
          "side": "gd1-hotel-a",
          "shortLabel": "ホテル①（支配人型）"
        },
        "gd1-hotel-b": {
          "label": "ホテル②（バフォメット型）",
          "no": 11,
          "fieldId": "FIELD-HOTEL",
          "initialHuman": "HOTEL-001",
          "mainDeck": [
            {
              "id": "HOTEL-001",
              "count": 1
            },
            {
              "id": "HOTEL-002",
              "count": 3
            },
            {
              "id": "HOTEL-003",
              "count": 4
            },
            {
              "id": "HOTEL-004",
              "count": 3
            },
            {
              "id": "HOTEL-005",
              "count": 2
            },
            {
              "id": "HOTEL-025",
              "count": 2
            },
            {
              "id": "HOTEL-017",
              "count": 2
            },
            {
              "id": "HOTEL-006",
              "count": 3
            },
            {
              "id": "HOTEL-007",
              "count": 3
            },
            {
              "id": "HOTEL-008",
              "count": 2
            },
            {
              "id": "HOTEL-009",
              "count": 1
            },
            {
              "id": "HOTEL-010",
              "count": 2
            },
            {
              "id": "MURA-010",
              "count": 2
            },
            {
              "id": "COMMON-003",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "HOTEL-011",
              "count": 2
            },
            {
              "id": "HOTEL-012",
              "count": 3
            }
          ],
          "side": "gd1-hotel-b",
          "shortLabel": "ホテル②（バフォメット型）"
        },
        "gd1-yoru": {
          "label": "夜の街",
          "no": 12,
          "fieldId": "FIELD-YORU",
          "initialHuman": "YORU-001",
          "mainDeck": [
            {
              "id": "YORU-001",
              "count": 1
            },
            {
              "id": "YORU-002",
              "count": 1
            },
            {
              "id": "YORU-003",
              "count": 2
            },
            {
              "id": "YORU-004",
              "count": 3
            },
            {
              "id": "YORU-005",
              "count": 1
            },
            {
              "id": "YORU-006",
              "count": 2
            },
            {
              "id": "YORU-026",
              "count": 2
            },
            {
              "id": "YORU-027",
              "count": 2
            },
            {
              "id": "YORU-007",
              "count": 3
            },
            {
              "id": "YORU-008",
              "count": 4
            },
            {
              "id": "YORU-009",
              "count": 4
            },
            {
              "id": "YORU-010",
              "count": 1
            },
            {
              "id": "YORU-011",
              "count": 2
            },
            {
              "id": "MURA-010",
              "count": 2
            },
            {
              "id": "YORU-012",
              "count": 2
            },
            {
              "id": "YORU-014",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "YORU-013",
              "count": 3
            }
          ],
          "side": "gd1-yoru",
          "shortLabel": "夜の街"
        },
        "gd1-yakata": {
          "label": "洋館",
          "no": 13,
          "fieldId": "FIELD-YAKATA",
          "initialHuman": "YAKATA-001",
          "mainDeck": [
            {
              "id": "YAKATA-001",
              "count": 1
            },
            {
              "id": "YAKATA-002",
              "count": 4
            },
            {
              "id": "YAKATA-003",
              "count": 3
            },
            {
              "id": "YAKATA-004",
              "count": 3
            },
            {
              "id": "YAKATA-005",
              "count": 4
            },
            {
              "id": "YAKATA-006",
              "count": 3
            },
            {
              "id": "YAKATA-007",
              "count": 4
            },
            {
              "id": "YAKATA-008",
              "count": 4
            },
            {
              "id": "YAKATA-009",
              "count": 3
            },
            {
              "id": "YAKATA-010",
              "count": 3
            },
            {
              "id": "YAKATA-011",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "YAKATA-012",
              "count": 3
            }
          ],
          "side": "gd1-yakata",
          "shortLabel": "洋館"
        },
        "gd1-yuen": {
          "label": "遊園地",
          "no": 14,
          "fieldId": "FIELD-YUEN",
          "initialHuman": "YUEN-001",
          "mainDeck": [
            {
              "id": "YUEN-001",
              "count": 1
            },
            {
              "id": "YUEN-002",
              "count": 3
            },
            {
              "id": "YUEN-003",
              "count": 2
            },
            {
              "id": "YUEN-004",
              "count": 3
            },
            {
              "id": "YUEN-005",
              "count": 3
            },
            {
              "id": "YUEN-006",
              "count": 3
            },
            {
              "id": "YUEN-007",
              "count": 2
            },
            {
              "id": "YUEN-008",
              "count": 2
            },
            {
              "id": "YUEN-009",
              "count": 3
            },
            {
              "id": "YUEN-010",
              "count": 2
            },
            {
              "id": "YUEN-022",
              "count": 1
            },
            {
              "id": "YUEN-023",
              "count": 2
            },
            {
              "id": "YUEN-024",
              "count": 2
            },
            {
              "id": "YUEN-025",
              "count": 2
            },
            {
              "id": "YUEN-026",
              "count": 2
            },
            {
              "id": "YUEN-027",
              "count": 2
            },
            {
              "id": "YUEN-031",
              "count": 2
            },
            {
              "id": "YUEN-028",
              "count": 1
            },
            {
              "id": "YUEN-029",
              "count": 1
            },
            {
              "id": "YUEN-030",
              "count": 1
            }
          ],
          "side": "gd1-yuen",
          "shortLabel": "遊園地"
        },
        "gd1-chokoku": {
          "label": "彫刻公園",
          "no": 15,
          "fieldId": "FIELD-CHOKOKU",
          "initialHuman": "CHOKOKU-001",
          "mainDeck": [
            {
              "id": "CHOKOKU-001",
              "count": 1
            },
            {
              "id": "CHOKOKU-002",
              "count": 4
            },
            {
              "id": "CHOKOKU-003",
              "count": 3
            },
            {
              "id": "CHOKOKU-004",
              "count": 3
            },
            {
              "id": "CHOKOKU-005",
              "count": 3
            },
            {
              "id": "CHOKOKU-006",
              "count": 4
            },
            {
              "id": "CHOKOKU-007",
              "count": 4
            },
            {
              "id": "CHOKOKU-008",
              "count": 3
            },
            {
              "id": "CHOKOKU-010",
              "count": 1
            },
            {
              "id": "CHOKOKU-009",
              "count": 2
            },
            {
              "id": "MURA-010",
              "count": 2
            },
            {
              "id": "CHOKOKU-011",
              "count": 2
            },
            {
              "id": "MURA-012",
              "count": 3
            },
            {
              "id": "CHOKOKU-012",
              "count": 3
            },
            {
              "id": "CHOKOKU-013",
              "count": 2
            }
          ],
          "side": "gd1-chokoku",
          "shortLabel": "彫刻公園"
        }
      };
      var GD1_ADOPTED = ["CHIKA-001", "CHIKA-002", "CHIKA-003", "CHIKA-004", "CHIKA-005", "CHIKA-006", "CHIKA-007", "CHIKA-008", "CHIKA-009", "CHIKA-010", "CHIKA-011", "CHIKA-012", "CHIKA-013", "CHIKA-024", "CHOKOKU-001", "CHOKOKU-002", "CHOKOKU-003", "CHOKOKU-004", "CHOKOKU-005", "CHOKOKU-006", "CHOKOKU-007", "CHOKOKU-008", "CHOKOKU-009", "CHOKOKU-010", "CHOKOKU-011", "CHOKOKU-012", "CHOKOKU-013", "COMMON-003", "DANCHI-001", "DANCHI-002", "DANCHI-003", "DANCHI-004", "DANCHI-005", "DANCHI-006", "DANCHI-007", "DANCHI-008", "DANCHI-009", "DANCHI-010", "DANCHI-011", "DANCHI-012", "FIELD-CHIKA", "FIELD-CHOKOKU", "FIELD-DANCHI", "FIELD-GAKKO", "FIELD-HOTEL", "FIELD-MORI", "FIELD-MURA", "FIELD-SHIMA", "FIELD-SHOTEN", "FIELD-YAKATA", "FIELD-YORU", "FIELD-YUEN", "GAKKO-001", "GAKKO-002", "GAKKO-003", "GAKKO-004", "GAKKO-005", "GAKKO-006", "GAKKO-007", "GAKKO-008", "GAKKO-009", "GAKKO-010", "GAKKO-011", "GAKKO-012", "GAKKO-013", "GAKKO-014", "GAKKO-024", "GAKKO-025", "GAKKO-026", "GEN3-004", "HOTEL-001", "HOTEL-002", "HOTEL-003", "HOTEL-004", "HOTEL-005", "HOTEL-006", "HOTEL-007", "HOTEL-008", "HOTEL-009", "HOTEL-010", "HOTEL-011", "HOTEL-012", "HOTEL-017", "HOTEL-025", "MORI-001", "MORI-002", "MORI-004", "MORI-005", "MORI-007", "MORI-017", "MORI-018", "MORI-023", "MURA-001", "MURA-002", "MURA-003", "MURA-004", "MURA-005", "MURA-006", "MURA-007", "MURA-008", "MURA-009", "MURA-010", "MURA-011", "MURA-012", "MURA-013", "SHIMA-001", "SHIMA-002", "SHIMA-003", "SHIMA-004", "SHIMA-005", "SHIMA-006", "SHIMA-007", "SHIMA-008", "SHIMA-009", "SHIMA-010", "SHIMA-011", "SHIMA-012", "SHIMA-013", "SHIMA-014", "SHIMA-027", "SHIMA-028", "SHOTEN-001", "SHOTEN-002", "SHOTEN-003", "SHOTEN-004", "SHOTEN-005", "SHOTEN-006", "SHOTEN-007", "SHOTEN-008", "SHOTEN-009", "SHOTEN-010", "SHOTEN-011", "SHOTEN-012", "SHOTEN-013", "SHOTEN-027", "YAKATA-001", "YAKATA-002", "YAKATA-003", "YAKATA-004", "YAKATA-005", "YAKATA-006", "YAKATA-007", "YAKATA-008", "YAKATA-009", "YAKATA-010", "YAKATA-011", "YAKATA-012", "YORU-001", "YORU-002", "YORU-003", "YORU-004", "YORU-005", "YORU-006", "YORU-007", "YORU-008", "YORU-009", "YORU-010", "YORU-011", "YORU-012", "YORU-013", "YORU-014", "YORU-026", "YORU-027", "YUEN-001", "YUEN-002", "YUEN-003", "YUEN-004", "YUEN-005", "YUEN-006", "YUEN-007", "YUEN-008", "YUEN-009", "YUEN-010", "YUEN-022", "YUEN-023", "YUEN-024", "YUEN-025", "YUEN-026", "YUEN-027", "YUEN-028", "YUEN-029", "YUEN-030", "YUEN-031"];
      var GD1_VERSION = "1.1";
      var GD1_SOURCE = {
        "version": "1.1",
        "cardTableSha256": "d282533dd90a3db362faa9fe107efcd34c495d420ac6ea61706ca30e58610149",
        "assumptions": [
          {
            "card": "SHOTEN-008",
            "class": "C-resolved",
            "note": "装備できる相手が未記載 → 裁定(v1.1 #11): 自分の人間・怪異どちらにも装備可"
          },
          {
            "card": "SHOTEN-009",
            "class": "C-resolved",
            "note": "装備できる相手が未記載 → 裁定(v1.1 #11): 自分の人間・怪異どちらにも装備可"
          },
          {
            "card": "SHOTEN-010",
            "class": "C-resolved",
            "note": "装備できる相手が未記載 → 裁定(v1.1 #11): 自分の人間・怪異どちらにも装備可"
          },
          {
            "card": "SHOTEN-011",
            "class": "C-resolved",
            "note": "装備できる相手が未記載 → 裁定(v1.1 #11): 自分の人間・怪異どちらにも装備可"
          },
          {
            "card": "SHOTEN-012",
            "class": "C-resolved",
            "note": "装備できる相手が未記載 → 裁定(v1.1 #11): 自分の人間・怪異どちらにも装備可"
          },
          {
            "card": "SHOTEN-026",
            "class": "C-resolved",
            "note": "装備できる相手が未記載 → 裁定(v1.1 #11): 自分の人間・怪異どちらにも装備可"
          },
          {
            "card": "YORU-012",
            "class": "B",
            "note": "汎G1(YORU-012) effect/equip_target blank → taken from COMMON-001 汎G1 (same name) → 裁定(v1.1 B) 確定"
          }
        ],
        "deckCountMismatch": [
          {
            "deck": "gd1-mori-a",
            "card": "MURA-010",
            "name": "懐中電灯",
            "deckCount": 4,
            "csvBaseCount": 3
          },
          {
            "deck": "gd1-hotel-b",
            "card": "HOTEL-025",
            "name": "ホ人5",
            "deckCount": 2,
            "csvBaseCount": 0
          },
          {
            "deck": "gd1-hotel-b",
            "card": "HOTEL-012",
            "name": "深夜営業",
            "deckCount": 3,
            "csvBaseCount": 2
          }
        ],
        "deckCountRule": "基準構築15本(3).pdf を canonical decklist として優先（裁定 v1.1 C）",
        "errata": [
          {
            "card": "MORI-004",
            "ruling": 2,
            "append": "。この効果は重複しない",
            "note": "ルピア: 複数いてもコスト-2は重複しない"
          },
          {
            "card": "GAKKO-012",
            "ruling": 7,
            "append": null,
            "note": "学グ2: 発動はこのグッズを装備している怪異自身の襲撃時のみ（テキストは将来エラッタ予定、UP試験はこの意味論で確定）"
          },
          {
            "card": "FIELD-YUEN",
            "ruling": 5,
            "append": null,
            "note": "遊園地: 「手札が7枚以下なら」はイベントを使った時点（解決前）の手札枚数で判定"
          },
          {
            "card": "FIELD-HOTEL",
            "ruling": 6,
            "append": null,
            "note": "ホテル: 【ターンに1回】の-1は条件を満たして実際に発動した時のみ消費"
          },
          {
            "card": "YORU-012",
            "ruling": "B",
            "append": null,
            "note": "汎G1(YORU-012) = COMMON-001 と同一性能で確定"
          }
        ]
      };
      if (typeof module !== "undefined" && module.exports) module.exports = { CARD_MASTER_GD1, DECKS_GD1, GD1_ADOPTED, GD1_SOURCE, GD1_VERSION };
    }
  });

  // src/data/decks-v1.0.json
  var require_decks_v1_0 = __commonJS({
    "src/data/decks-v1.0.json"(exports, module) {
      module.exports = {
        "gd1-mura": {
          key: "gd1-mura",
          set: "R28最終",
          displayName: "村",
          label: "村",
          no: 1,
          fieldId: "FIELD-MURA",
          initialHuman: "MURA-001",
          mainDeck: [
            {
              id: "MURA-001",
              count: 1
            },
            {
              id: "MURA-002",
              count: 3
            },
            {
              id: "MURA-003",
              count: 2
            },
            {
              id: "MURA-004",
              count: 3
            },
            {
              id: "MURA-005",
              count: 3
            },
            {
              id: "MURA-006",
              count: 4
            },
            {
              id: "MURA-007",
              count: 4
            },
            {
              id: "MURA-008",
              count: 4
            },
            {
              id: "MURA-009",
              count: 3
            },
            {
              id: "MURA-010",
              count: 3
            },
            {
              id: "MURA-011",
              count: 2
            },
            {
              id: "MURA-013",
              count: 3
            },
            {
              id: "MURA-012",
              count: 3
            },
            {
              id: "GEN5-001",
              count: 2
            }
          ],
          side: "gd1-mura",
          shortLabel: "村"
        },
        "gd1-danchi": {
          key: "gd1-danchi",
          set: "R28最終",
          displayName: "ループ団地",
          label: "ループ団地",
          no: 2,
          fieldId: "FIELD-DANCHI",
          initialHuman: "DANCHI-001",
          mainDeck: [
            {
              id: "DANCHI-001",
              count: 1
            },
            {
              id: "DANCHI-002",
              count: 3
            },
            {
              id: "DANCHI-004",
              count: 3
            },
            {
              id: "DANCHI-015",
              count: 4
            },
            {
              id: "DANCHI-005",
              count: 4
            },
            {
              id: "MURA-012",
              count: 3
            },
            {
              id: "DANCHI-006",
              count: 4
            },
            {
              id: "DANCHI-007",
              count: 4
            },
            {
              id: "DANCHI-008",
              count: 4
            },
            {
              id: "DANCHI-019",
              count: 4
            },
            {
              id: "DANCHI-009",
              count: 4
            },
            {
              id: "COMMON-007",
              count: 2
            }
          ],
          side: "gd1-danchi",
          shortLabel: "ループ団地"
        },
        "gd1-gakko": {
          key: "gd1-gakko",
          set: "R28最終",
          displayName: "学校",
          label: "学校",
          no: 3,
          fieldId: "FIELD-GAKKO",
          initialHuman: "GAKKO-001",
          mainDeck: [
            {
              id: "GAKKO-001",
              count: 1
            },
            {
              id: "GAKKO-002",
              count: 3
            },
            {
              id: "GAKKO-003",
              count: 3
            },
            {
              id: "GAKKO-005",
              count: 3
            },
            {
              id: "GAKKO-025",
              count: 3
            },
            {
              id: "GAKKO-019",
              count: 2
            },
            {
              id: "GAKKO-006",
              count: 4
            },
            {
              id: "GAKKO-007",
              count: 2
            },
            {
              id: "GAKKO-008",
              count: 4
            },
            {
              id: "GAKKO-009",
              count: 2
            },
            {
              id: "GAKKO-022",
              count: 3
            },
            {
              id: "GAKKO-024",
              count: 3
            },
            {
              id: "GAKKO-010",
              count: 3
            },
            {
              id: "GAKKO-011",
              count: 1
            },
            {
              id: "GAKKO-013",
              count: 1
            },
            {
              id: "MURA-012",
              count: 2
            }
          ],
          side: "gd1-gakko",
          shortLabel: "学校"
        },
        "gd1-shoten": {
          key: "gd1-shoten",
          set: "R28最終",
          displayName: "商店街",
          label: "商店街",
          no: 4,
          fieldId: "FIELD-SHOTEN",
          initialHuman: "SHOTEN-001",
          mainDeck: [
            {
              id: "SHOTEN-001",
              count: 1
            },
            {
              id: "SHOTEN-002",
              count: 3
            },
            {
              id: "SHOTEN-003",
              count: 4
            },
            {
              id: "SHOTEN-004",
              count: 3
            },
            {
              id: "SHOTEN-005",
              count: 2
            },
            {
              id: "SHOTEN-006",
              count: 4
            },
            {
              id: "SHOTEN-007",
              count: 4
            },
            {
              id: "SHOTEN-027",
              count: 2
            },
            {
              id: "SHOTEN-008",
              count: 4
            },
            {
              id: "SHOTEN-009",
              count: 3
            },
            {
              id: "SHOTEN-010",
              count: 3
            },
            {
              id: "SHOTEN-011",
              count: 1
            },
            {
              id: "SHOTEN-012",
              count: 1
            },
            {
              id: "SHOTEN-013",
              count: 1
            },
            {
              id: "COMMON-004",
              count: 2
            },
            {
              id: "SHOTEN-021",
              count: 2
            }
          ],
          side: "gd1-shoten",
          shortLabel: "商店街"
        },
        "gd1-chika": {
          key: "gd1-chika",
          set: "R28最終",
          displayName: "地下",
          label: "地下 v1.7b",
          no: 5,
          fieldId: "FIELD-CHIKA",
          initialHuman: "CHIKA-001",
          mainDeck: [
            {
              id: "CHIKA-001",
              count: 1
            },
            {
              id: "CHIKA-002",
              count: 2
            },
            {
              id: "CHIKA-003",
              count: 4
            },
            {
              id: "CHIKA-005",
              count: 1
            },
            {
              id: "CHIKA-006",
              count: 2
            },
            {
              id: "CHIKA-007",
              count: 4
            },
            {
              id: "CHIKA-008",
              count: 4
            },
            {
              id: "CHIKA-009",
              count: 4
            },
            {
              id: "CHIKA-010",
              count: 4
            },
            {
              id: "CHIKA-011",
              count: 2
            },
            {
              id: "MURA-010",
              count: 2
            },
            {
              id: "MURA-012",
              count: 2
            },
            {
              id: "CHIKA-018",
              count: 2
            },
            {
              id: "CHIKA-024",
              count: 2
            },
            {
              id: "GEN2-009",
              count: 2
            },
            {
              id: "GEN3-004",
              count: 2
            }
          ],
          side: "gd1-chika",
          shortLabel: "地下"
        },
        "gd1-mori-a": {
          key: "gd1-mori-a",
          set: "R28最終",
          displayName: "森",
          label: "森（トキ型 v1.5）",
          no: 6,
          fieldId: "FIELD-MORI",
          initialHuman: "MORI-001",
          mainDeck: [
            {
              id: "MORI-001",
              count: 1
            },
            {
              id: "MORI-002",
              count: 4
            },
            {
              id: "MORI-004",
              count: 3
            },
            {
              id: "MORI-023",
              count: 4
            },
            {
              id: "MORI-025",
              count: 3
            },
            {
              id: "MORI-005",
              count: 4
            },
            {
              id: "MORI-007",
              count: 2
            },
            {
              id: "MORI-017",
              count: 4
            },
            {
              id: "MORI-018",
              count: 4
            },
            {
              id: "MURA-010",
              count: 4
            },
            {
              id: "MURA-012",
              count: 4
            },
            {
              id: "GEN2-009",
              count: 3
            }
          ],
          side: "gd1-mori-a",
          shortLabel: "森（トキ型）"
        },
        "gd1-shima": {
          key: "gd1-shima",
          set: "R28最終",
          displayName: "島",
          label: "島",
          no: 9,
          fieldId: "FIELD-SHIMA",
          initialHuman: "SHIMA-004",
          mainDeck: [
            {
              id: "SHIMA-004",
              count: 1
            },
            {
              id: "SHIMA-006",
              count: 1
            },
            {
              id: "SHIMA-009",
              count: 2
            },
            {
              id: "SHIMA-007",
              count: 2
            },
            {
              id: "SHIMA-008",
              count: 3
            },
            {
              id: "SHIMA-027",
              count: 2
            },
            {
              id: "SHIMA-028",
              count: 2
            },
            {
              id: "SHIMA-001",
              count: 4
            },
            {
              id: "SHIMA-010",
              count: 2
            },
            {
              id: "MURA-010",
              count: 2
            },
            {
              id: "SHIMA-013",
              count: 2
            },
            {
              id: "MURA-012",
              count: 3
            },
            {
              id: "SHIMA-011",
              count: 3
            },
            {
              id: "SHIMA-012",
              count: 3
            },
            {
              id: "SHIMA-014",
              count: 2
            },
            {
              id: "GEN3-004",
              count: 2
            },
            {
              id: "COMMON-004",
              count: 2
            },
            {
              id: "GEN5-001",
              count: 2
            }
          ],
          side: "gd1-shima",
          shortLabel: "島"
        },
        "gd1-hotel-a": {
          key: "gd1-hotel-a",
          set: "R28最終",
          displayName: "ホテル①",
          label: "ホテル①（支配人型 v1.5）",
          no: 10,
          fieldId: "FIELD-HOTEL",
          initialHuman: "HOTEL-001",
          mainDeck: [
            {
              id: "HOTEL-001",
              count: 1
            },
            {
              id: "HOTEL-002",
              count: 4
            },
            {
              id: "HOTEL-003",
              count: 4
            },
            {
              id: "HOTEL-004",
              count: 3
            },
            {
              id: "HOTEL-017",
              count: 2
            },
            {
              id: "HOTEL-006",
              count: 4
            },
            {
              id: "HOTEL-008",
              count: 4
            },
            {
              id: "HOTEL-007",
              count: 4
            },
            {
              id: "MURA-010",
              count: 2
            },
            {
              id: "MURA-012",
              count: 4
            },
            {
              id: "HOTEL-011",
              count: 4
            },
            {
              id: "HOTEL-012",
              count: 2
            },
            {
              id: "GEN5-002",
              count: 2
            }
          ],
          side: "gd1-hotel-a",
          shortLabel: "ホテル①（支配人型）"
        },
        "gd1-hotel-b": {
          key: "gd1-hotel-b",
          set: "R28最終",
          displayName: "ホテル②",
          label: "ホテル②（バフォメット型 v1.5）",
          no: 11,
          fieldId: "FIELD-HOTEL",
          initialHuman: "HOTEL-001",
          mainDeck: [
            {
              id: "HOTEL-001",
              count: 1
            },
            {
              id: "HOTEL-002",
              count: 4
            },
            {
              id: "HOTEL-003",
              count: 4
            },
            {
              id: "HOTEL-004",
              count: 3
            },
            {
              id: "HOTEL-017",
              count: 2
            },
            {
              id: "HOTEL-006",
              count: 4
            },
            {
              id: "HOTEL-007",
              count: 4
            },
            {
              id: "HOTEL-010",
              count: 4
            },
            {
              id: "MURA-010",
              count: 4
            },
            {
              id: "MURA-012",
              count: 4
            },
            {
              id: "HOTEL-012",
              count: 4
            },
            {
              id: "HOTEL-008",
              count: 2
            }
          ],
          side: "gd1-hotel-b",
          shortLabel: "ホテル②（バフォメット型）"
        },
        "gd1-yoru": {
          key: "gd1-yoru",
          set: "R28最終",
          displayName: "夜の街",
          label: "夜の街 v1.5",
          no: 12,
          fieldId: "FIELD-YORU",
          initialHuman: "YORU-001",
          mainDeck: [
            {
              id: "YORU-001",
              count: 1
            },
            {
              id: "YORU-003",
              count: 2
            },
            {
              id: "YORU-002",
              count: 1
            },
            {
              id: "YORU-005",
              count: 4
            },
            {
              id: "YORU-004",
              count: 2
            },
            {
              id: "YORU-026",
              count: 4
            },
            {
              id: "YORU-017",
              count: 2
            },
            {
              id: "YORU-007",
              count: 2
            },
            {
              id: "YORU-009",
              count: 4
            },
            {
              id: "YORU-011",
              count: 4
            },
            {
              id: "YORU-010",
              count: 2
            },
            {
              id: "YORU-025",
              count: 2
            },
            {
              id: "YORU-013",
              count: 4
            },
            {
              id: "GEN3-004",
              count: 2
            },
            {
              id: "MURA-010",
              count: 2
            },
            {
              id: "GEN5-001",
              count: 2
            }
          ],
          side: "gd1-yoru",
          shortLabel: "夜の街"
        },
        "gd1-yakata": {
          key: "gd1-yakata",
          set: "R28最終",
          displayName: "洋館",
          label: "洋館",
          no: 13,
          fieldId: "FIELD-YAKATA",
          initialHuman: "YAKATA-001",
          mainDeck: [
            {
              id: "YAKATA-001",
              count: 1
            },
            {
              id: "YAKATA-002",
              count: 4
            },
            {
              id: "YAKATA-003",
              count: 1
            },
            {
              id: "YAKATA-005",
              count: 4
            },
            {
              id: "YAKATA-013",
              count: 2
            },
            {
              id: "YAKATA-006",
              count: 4
            },
            {
              id: "YAKATA-007",
              count: 4
            },
            {
              id: "YAKATA-008",
              count: 4
            },
            {
              id: "YAKATA-024",
              count: 2
            },
            {
              id: "YAKATA-009",
              count: 3
            },
            {
              id: "YAKATA-020",
              count: 2
            },
            {
              id: "YAKATA-012",
              count: 2
            },
            {
              id: "YAKATA-010",
              count: 3
            },
            {
              id: "MURA-012",
              count: 2
            },
            {
              id: "YAKATA-016",
              count: 2
            }
          ],
          side: "gd1-yakata",
          shortLabel: "洋館"
        },
        "gd1-yuen": {
          key: "gd1-yuen",
          set: "R28最終",
          displayName: "遊園地",
          label: "遊園地 v1.9",
          no: 14,
          fieldId: "FIELD-YUEN",
          initialHuman: "YUEN-001",
          mainDeck: [
            {
              id: "YUEN-001",
              count: 1
            },
            {
              id: "YUEN-002",
              count: 2
            },
            {
              id: "YUEN-004",
              count: 3
            },
            {
              id: "YUEN-005",
              count: 4
            },
            {
              id: "YUEN-012",
              count: 2
            },
            {
              id: "YUEN-007",
              count: 2
            },
            {
              id: "YUEN-020",
              count: 2
            },
            {
              id: "YUEN-009",
              count: 4
            },
            {
              id: "YUEN-031",
              count: 4
            },
            {
              id: "YUEN-027",
              count: 4
            },
            {
              id: "YUEN-035",
              count: 1
            },
            {
              id: "YUEN-028",
              count: 4
            },
            {
              id: "YUEN-032",
              count: 2
            },
            {
              id: "YUEN-034",
              count: 2
            },
            {
              id: "YUEN-030",
              count: 1
            },
            {
              id: "MURA-010",
              count: 2
            }
          ],
          side: "gd1-yuen",
          shortLabel: "遊園地"
        },
        "gd1-chokoku": {
          key: "gd1-chokoku",
          set: "R28最終",
          displayName: "彫刻公園",
          label: "彫刻公園",
          no: 15,
          fieldId: "FIELD-CHOKOKU",
          initialHuman: "CHOKOKU-001",
          mainDeck: [
            {
              id: "CHOKOKU-001",
              count: 1
            },
            {
              id: "CHOKOKU-002",
              count: 2
            },
            {
              id: "CHOKOKU-003",
              count: 1
            },
            {
              id: "CHOKOKU-004",
              count: 3
            },
            {
              id: "CHOKOKU-005",
              count: 3
            },
            {
              id: "CHOKOKU-006",
              count: 4
            },
            {
              id: "CHOKOKU-007",
              count: 4
            },
            {
              id: "CHOKOKU-008",
              count: 2
            },
            {
              id: "CHOKOKU-009",
              count: 2
            },
            {
              id: "CHOKOKU-023",
              count: 2
            },
            {
              id: "CHOKOKU-012",
              count: 1
            },
            {
              id: "CHOKOKU-013",
              count: 2
            },
            {
              id: "GEN5-001",
              count: 2
            },
            {
              id: "MURA-012",
              count: 3
            },
            {
              id: "MURA-010",
              count: 4
            },
            {
              id: "CHOKOKU-014",
              count: 2
            },
            {
              id: "GEN2-008",
              count: 2
            }
          ],
          side: "gd1-chokoku",
          shortLabel: "彫刻公園"
        },
        "gd1-yoru-lock": {
          key: "gd1-yoru-lock",
          set: "ギミック版（gd1-yoru H1）",
          displayName: "夜の街「ロック型」",
          label: "夜の街（ロック型）",
          no: 12,
          fieldId: "FIELD-YORU",
          initialHuman: "YORU-001",
          mainDeck: [
            {
              id: "YORU-001",
              count: 1
            },
            {
              id: "YORU-003",
              count: 4
            },
            {
              id: "YORU-005",
              count: 4
            },
            {
              id: "YORU-004",
              count: 4
            },
            {
              id: "YORU-026",
              count: 2
            },
            {
              id: "MURA-012",
              count: 3
            },
            {
              id: "YORU-007",
              count: 4
            },
            {
              id: "YORU-009",
              count: 4
            },
            {
              id: "YORU-011",
              count: 2
            },
            {
              id: "YORU-023",
              count: 4
            },
            {
              id: "YORU-028",
              count: 4
            },
            {
              id: "YORU-013",
              count: 2
            },
            {
              id: "GEN3-004",
              count: 2
            }
          ],
          side: "gd1-yoru-lock",
          shortLabel: "夜の街・ロック型"
        },
        "gd1-mura-exile": {
          key: "gd1-mura-exile",
          set: "ギミック版（gd1-mura H2）",
          displayName: "村「除外軸型」",
          label: "村（除外軸型）",
          no: 1,
          fieldId: "FIELD-MURA",
          initialHuman: "MURA-001",
          mainDeck: [
            {
              id: "MURA-001",
              count: 1
            },
            {
              id: "MURA-002",
              count: 3
            },
            {
              id: "MURA-003",
              count: 4
            },
            {
              id: "MURA-017",
              count: 2
            },
            {
              id: "MURA-004",
              count: 2
            },
            {
              id: "MURA-006",
              count: 4
            },
            {
              id: "MURA-021",
              count: 2
            },
            {
              id: "MURA-007",
              count: 2
            },
            {
              id: "MURA-028",
              count: 4
            },
            {
              id: "MURA-019",
              count: 3
            },
            {
              id: "MURA-020",
              count: 2
            },
            {
              id: "MURA-025",
              count: 3
            },
            {
              id: "MURA-012",
              count: 4
            },
            {
              id: "MURA-010",
              count: 2
            },
            {
              id: "MURA-011",
              count: 2
            }
          ],
          side: "gd1-mura-exile",
          shortLabel: "村・除外軸型"
        },
        "gd1-chokoku-noise9": {
          key: "gd1-chokoku-noise9",
          set: "ギミック版（gd1-chokoku H1）",
          displayName: "彫刻公園「物音9型」",
          label: "彫刻公園（物音9型）",
          no: 15,
          fieldId: "FIELD-CHOKOKU",
          initialHuman: "CHOKOKU-001",
          mainDeck: [
            {
              id: "CHOKOKU-001",
              count: 1
            },
            {
              id: "CHOKOKU-002",
              count: 3
            },
            {
              id: "CHOKOKU-003",
              count: 2
            },
            {
              id: "CHOKOKU-015",
              count: 3
            },
            {
              id: "CHOKOKU-004",
              count: 3
            },
            {
              id: "CHOKOKU-006",
              count: 4
            },
            {
              id: "CHOKOKU-007",
              count: 3
            },
            {
              id: "CHOKOKU-008",
              count: 3
            },
            {
              id: "CHOKOKU-022",
              count: 3
            },
            {
              id: "CHOKOKU-010",
              count: 3
            },
            {
              id: "CHOKOKU-023",
              count: 2
            },
            {
              id: "CHOKOKU-012",
              count: 3
            },
            {
              id: "CHOKOKU-025",
              count: 2
            },
            {
              id: "CHOKOKU-011",
              count: 2
            },
            {
              id: "MURA-012",
              count: 3
            }
          ],
          side: "gd1-chokoku-noise9",
          shortLabel: "彫刻公園・物音9型"
        },
        "gd1-hotel-a-boiler": {
          key: "gd1-hotel-a-boiler",
          set: "ギミック版（gd1-hotel-a H1）",
          displayName: "ホテル①「強制展開＋ボイラー型」",
          label: "ホテル①（強制展開＋ボイラー型）",
          no: 10,
          fieldId: "FIELD-HOTEL",
          initialHuman: "HOTEL-001",
          mainDeck: [
            {
              id: "HOTEL-001",
              count: 1
            },
            {
              id: "HOTEL-002",
              count: 3
            },
            {
              id: "HOTEL-003",
              count: 3
            },
            {
              id: "HOTEL-004",
              count: 3
            },
            {
              id: "HOTEL-016",
              count: 2
            },
            {
              id: "HOTEL-018",
              count: 4
            },
            {
              id: "HOTEL-006",
              count: 3
            },
            {
              id: "HOTEL-008",
              count: 4
            },
            {
              id: "HOTEL-007",
              count: 2
            },
            {
              id: "HOTEL-009",
              count: 3
            },
            {
              id: "HOTEL-020",
              count: 2
            },
            {
              id: "HOTEL-011",
              count: 4
            },
            {
              id: "HOTEL-012",
              count: 2
            },
            {
              id: "MURA-012",
              count: 3
            },
            {
              id: "MURA-010",
              count: 1
            }
          ],
          side: "gd1-hotel-a-boiler",
          shortLabel: "ホテル①・強制展開＋ボイラー型"
        },
        "gd1-yakata-lost": {
          key: "gd1-yakata-lost",
          set: "ギミック版（gd1-yakata H1）",
          displayName: "洋館「ロスト切り札型」",
          label: "洋館（ロスト切り札型）",
          no: 13,
          fieldId: "FIELD-YAKATA",
          initialHuman: "YAKATA-001",
          mainDeck: [
            {
              id: "YAKATA-001",
              count: 1
            },
            {
              id: "YAKATA-002",
              count: 4
            },
            {
              id: "YAKATA-003",
              count: 3
            },
            {
              id: "YAKATA-004",
              count: 2
            },
            {
              id: "YAKATA-005",
              count: 3
            },
            {
              id: "YAKATA-017",
              count: 2
            },
            {
              id: "YAKATA-006",
              count: 3
            },
            {
              id: "YAKATA-007",
              count: 4
            },
            {
              id: "YAKATA-008",
              count: 4
            },
            {
              id: "YAKATA-018",
              count: 2
            },
            {
              id: "YAKATA-009",
              count: 2
            },
            {
              id: "YAKATA-020",
              count: 2
            },
            {
              id: "YAKATA-021",
              count: 2
            },
            {
              id: "YAKATA-010",
              count: 2
            },
            {
              id: "YAKATA-011",
              count: 2
            },
            {
              id: "MURA-012",
              count: 2
            }
          ],
          side: "gd1-yakata-lost",
          shortLabel: "洋館・ロスト切り札型"
        }
      };
    }
  });

  // src/core/ai-core-gd1.js
  var require_ai_core_gd1 = __commonJS({
    "src/core/ai-core-gd1.js"(exports, module) {
      "use strict";
      function createAiCoreGd1(env) {
        const { Game, Effects, CARD_MASTER } = env;
        const other = (s) => s === "village" ? "mansion" : "village";
        const AiCore = {
          forecast(youkaiInst, humanInst, defenseMargin) {
            const a = Game.getStats(youkaiInst), d = Game.getStats(humanInst);
            if (!a.hasStats || !d.hasStats) return null;
            const redHuman = Game._calcReduction(humanInst, youkaiInst.owner).total;
            const redYoukai = Game._calcYoukaiReduction(youkaiInst, youkaiInst.owner);
            const margin = defenseMargin || 0;
            const toHuman = Math.max(0, Math.max(0, a.curSpeed - redHuman) - margin);
            const toYoukai = Math.max(0, d.curSpeed - redYoukai);
            const killsHuman = humanInst.accumulatedDamage + toHuman >= d.maxHp;
            const killsYoukai = youkaiInst.accumulatedDamage + toYoukai >= a.maxHp;
            return { youkai: youkaiInst, human: humanInst, toHuman, toYoukai, killsHuman, killsYoukai, mutual: killsHuman && killsYoukai };
          },
          incomingPursuit(side) {
            const t = Game.state.tracking[other(side)];
            if (!t) return null;
            return { youkai: t.youkai, human: t.humans[0], humans: t.humans, forecast: this.forecast(t.youkai, t.humans[0]) };
          },
          outgoingPursuit(side) {
            const t = Game.state.tracking[side];
            if (!t) return null;
            return { youkai: t.youkai, human: t.humans[0], humans: t.humans, forecast: this.forecast(t.youkai, t.humans[0]) };
          },
          canLegallyPlayCard(side, inst) {
            return Game.canPlay(side, inst).ok;
          },
          hasAnyPlayableCard(side) {
            return Game.state.players[side].hand.some((c) => this.canLegallyPlayCard(side, c));
          },
          legalMainActions(side) {
            const st = Game.state;
            const p = st.players[side];
            const acts = [];
            p.hand.forEach((inst) => {
              const faces = [0].concat(inst.master.directPlayFaces || []);
              faces.forEach((face) => {
                const r = Game.canPlay(side, inst, face ? { face } : void 0);
                if (!r.ok) return;
                const m = face ? CARD_MASTER[inst.faces[face]] : inst.master;
                if (m.type === "human") acts.push(face ? { kind: "PLAY_HUMAN", inst, face } : { kind: "PLAY_HUMAN", inst });
                else if (m.type === "youkai") acts.push(face ? { kind: "PLAY_YOUKAI", inst, face } : { kind: "PLAY_YOUKAI", inst });
                else if (m.type === "goods") Game.getGoodsTargets(side, inst).forEach((t) => acts.push({ kind: "EQUIP_GOODS", inst, target: t }));
                else if (m.type === "event") acts.push({ kind: "PLAY_EVENT", inst });
              });
            });
            p.humans.concat(p.youkai).forEach((inst) => {
              Effects.abilitiesOf(side, inst, st).forEach((ab) => {
                ab.candidates(side, inst, st).forEach((target) => acts.push({ kind: "ACTIVATE", inst, ability: ab.key, target }));
              });
            });
            acts.push({ kind: "PASS" });
            return acts;
          },
          /** apply a main action returned by legalMainActions (shared by every driver) */
          applyMainAction(side, a) {
            if (!a || a.kind === "PASS") return { ok: true };
            if (a.kind === "PLAY_HUMAN" || a.kind === "PLAY_YOUKAI") return Game.playUnit(side, a.inst, a.face ? { face: a.face } : void 0);
            if (a.kind === "EQUIP_GOODS") return Game.playGoods(side, a.inst, a.target);
            if (a.kind === "PLAY_EVENT") return Game.playEvent(side, a.inst);
            if (a.kind === "ACTIVATE") {
              const ab = Effects.abilitiesOf(side, a.inst, Game.state).find((x) => x.key === a.ability);
              if (!ab) return { ok: false, reasons: ["unknown ability"] };
              if (ab.candidates(side, a.inst, Game.state).indexOf(a.target) === -1) return { ok: false, reasons: ["illegal target"] };
              const r = ab.run(side, a.inst, a.target, Game.state);
              return { ok: !!r };
            }
            return { ok: false, reasons: ["unknown action kind " + a.kind] };
          },
          legalPursuits(side) {
            const st = Game.state;
            const me = st.players[side], you = st.players[other(side)];
            const opts = [];
            if (!st.tracking[side]) {
              me.youkai.forEach((yk) => {
                if (yk.tracking) return;
                you.humans.forEach((hm) => {
                  if (!Game.pursuitBlockReason(side, yk, [hm])) opts.push({ kind: "PURSUE", youkai: yk, human: hm, humans: [hm], forecast: this.forecast(yk, hm) });
                });
                if (Game.hasDoublePursuit(yk)) {
                  for (let i = 0; i < you.humans.length; i++) for (let j = i + 1; j < you.humans.length; j++) {
                    const pair = [you.humans[i], you.humans[j]];
                    if (!Game.pursuitBlockReason(side, yk, pair)) opts.push({ kind: "PURSUE", youkai: yk, human: pair[0], humans: pair, forecast: this.forecast(yk, pair[0]), forecast2: this.forecast(yk, pair[1]) });
                  }
                }
              });
            }
            opts.push({ kind: "NO_PURSUE" });
            return opts;
          },
          lostRoom(side) {
            const p = Game.state.players[side];
            return Math.max(0, p.field.master.lostLimit - p.lost.length);
          },
          isOnTheBrink(side) {
            const p = Game.state.players[side];
            return this.lostRoom(side) <= 1 || p.humans.length <= 1;
          },
          countTrait(side, zone, trait) {
            const p = Game.state.players[side];
            const list = zone === "lost" ? p.lost : p.trash;
            return list.filter((c) => (c.master.traits || []).indexOf(trait) !== -1).length;
          },
          hasCardOnField(side, cardId) {
            const p = Game.state.players[side];
            return p.humans.concat(p.youkai).some((c) => c.cardId === cardId);
          },
          countInHand(side, cardId) {
            return Game.state.players[side].hand.filter((c) => c.cardId === cardId).length;
          }
        };
        return AiCore;
      }
      module.exports = { createAiCoreGd1 };
    }
  });

  // src/core/agents-gd1.js
  var require_agents_gd1 = __commonJS({
    "src/core/agents-gd1.js"(exports, module) {
      "use strict";
      function hash32(t) {
        let h = 2166136261 >>> 0;
        const s = String(t);
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
      }
      function rng32(seed) {
        let x = hash32(seed) || 2654435769;
        const f = () => {
          x ^= x << 13;
          x >>>= 0;
          x ^= x >>> 17;
          x ^= x << 5;
          x >>>= 0;
          return x / 4294967296;
        };
        f.int = (n) => Math.floor(f() * n);
        return f;
      }
      function createAgentsGd1(env) {
        const { Game, AiCore } = env;
        const AiUiOpsGd1 = {
          create(ai, item) {
            const cardId = item && item.source ? item.source.cardId : null;
            const note = (what) => {
              if (Game.state) Game.state.log.push("（AI既定選択：" + what + "）");
            };
            return {
              showCards: null,
              confirmYesNo(title, message, cb) {
                cb(ai.shouldUseOptional ? !!ai.shouldUseOptional(cardId, { title, message }) : (note("confirm→yes " + title), true));
              },
              pickCards(options, cb) {
                cb(AiUiOpsGd1._pick(ai, options));
              },
              pickBoardTarget(options, cb) {
                const list = (options.candidates || []).slice();
                if (!list.length) {
                  cb(null);
                  return;
                }
                cb(ai.chooseDamageTarget && ai.chooseDamageTarget(list, options.amount || 1) || list[0]);
              },
              pickOption(options, cb) {
                const list = options.options || [];
                if (!list.length) {
                  cb(null);
                  return;
                }
                if (ai.chooseOption) {
                  cb(ai.chooseOption(list, options) || list[0]);
                  return;
                }
                note("option→first " + options.title);
                cb(list[0]);
              },
              pickOrder(options, cb) {
                const items = (options.items || []).slice();
                if (ai.chooseOrder) {
                  cb(ai.chooseOrder(items, options) || items);
                  return;
                }
                note("order→as-is " + options.title);
                cb(items);
              }
            };
          },
          _pick(ai, options) {
            const all = (options.cards || []).slice();
            const selectable = options.selectable ? options.selectable.slice() : all;
            const count = options.count || 1;
            const mode = options.mode || "max";
            const canSkip = mode !== "exact";
            let pool = all.filter((c) => selectable.indexOf(c) !== -1);
            if (!pool.length) return [];
            const side = ai.side;
            const hand = Game.state.players[side].hand;
            const isDiscard = pool.every((c) => hand.indexOf(c) !== -1) && !options.privateView;
            const chosen = [];
            for (let i = 0; i < count && pool.length; i++) {
              let one;
              if (options.privateView && ai.chooseOppDiscard) one = ai.chooseOppDiscard(pool);
              else one = isDiscard ? ai.chooseDiscard ? ai.chooseDiscard(pool) : pool[0] : ai.choosePick ? ai.choosePick(pool, canSkip && chosen.length === 0) : pool[0];
              if (!one) break;
              chosen.push(one);
              pool = pool.filter((c) => c !== one);
            }
            if (!canSkip) while (chosen.length < count && pool.length) chosen.push(pool.shift());
            return chosen;
          }
        };
        function createRandomAgent(side, seed, opts) {
          const r = rng32("RLA|" + seed + "|" + side);
          const o = opts || {};
          const pickRand = (list) => list[r.int(list.length)];
          return {
            side,
            label: "RandomLegalAgent",
            seed: String(seed),
            chooseMulligan() {
              const p = Game.state.players[side];
              return p.hand.filter(() => r() < (o.mulliganRate == null ? 0.3 : o.mulliganRate)).map((c) => c.uid);
            },
            shouldMulligan() {
              return false;
            },
            chooseMainAction(legal) {
              const acts = legal || AiCore.legalMainActions(side);
              if (o.passBias && r() < o.passBias) return acts[acts.length - 1];
              return pickRand(acts);
            },
            choosePursuit(legal) {
              const opts2 = legal || AiCore.legalPursuits(side);
              return pickRand(opts2);
            },
            chooseDiscard(options) {
              return pickRand(options);
            },
            choosePick(options, canSkip) {
              if (canSkip && r() < 0.25) return null;
              return pickRand(options);
            },
            chooseOppDiscard(options) {
              return pickRand(options);
            },
            chooseDamageTarget(options) {
              return pickRand(options);
            },
            shouldUseOptional() {
              return r() < 0.7;
            },
            chooseOption(list) {
              return pickRand(list);
            },
            chooseOrder(items) {
              const a = items.slice();
              for (let i = a.length - 1; i > 0; i--) {
                const j = r.int(i + 1);
                const t = a[i];
                a[i] = a[j];
                a[j] = t;
              }
              return a;
            },
            chooseEffectOrder(cands) {
              return pickRand(cands);
            }
          };
        }
        return { AiUiOpsGd1, createRandomAgent, rng32 };
      }
      module.exports = { createAgentsGd1, hash32, rng32 };
    }
  });

  // src/core/fair-determinize-gd1.js
  var require_fair_determinize_gd1 = __commonJS({
    "src/core/fair-determinize-gd1.js"(exports, module) {
      "use strict";
      var FAIR_UID_BASE = 5e7;
      function seedHash(text) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < text.length; i++) {
          h ^= text.charCodeAt(i);
          h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
      }
      function makeRng(text) {
        let x = seedHash(String(text)) || 2654435769;
        return function() {
          x ^= x << 13;
          x >>>= 0;
          x ^= x >>> 17;
          x ^= x << 5;
          x >>>= 0;
          return x / 4294967296;
        };
      }
      function shuffle(arr, rnd) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          const t = arr[i];
          arr[i] = arr[j];
          arr[j] = t;
        }
        return arr;
      }
      var other = (s) => s === "village" ? "mansion" : "village";
      function createFairDeterminizerGd1(env, options) {
        const { CARD_MASTER } = env;
        const opt = Object.assign({ maxCopies: 4, prior: "uniform", alphaOwn: 1, alphaOther: 0.25 }, options || {});
        const allIds = Object.keys(CARD_MASTER).filter((id) => {
          const m = CARD_MASTER[id];
          return m.type !== "field" && !m.faceOnly;
        });
        const isZeroCostHuman = (m) => m.type === "human" && Number(m.cost || 0) === 0;
        const factionOf = (m) => m.generic ? "common" : m.faction;
        function observe(p) {
          const seen = /* @__PURE__ */ Object.create(null), factions = /* @__PURE__ */ Object.create(null);
          const add = (c) => {
            if (!c || !c.cardId) return;
            const id = c.faces ? c.faces[0] : c.cardId;
            seen[id] = (seen[id] || 0) + 1;
            const f = factionOf(CARD_MASTER[id]);
            if (f !== "common") factions[f] = true;
            (c.equipment || []).forEach(add);
          };
          ["humans", "youkai", "lost", "trash", "exile"].forEach((z) => (p[z] || []).forEach(add));
          return { seen, factions };
        }
        function buildPrior(st, opp) {
          const p = st.players[opp];
          const F = p.field && p.field.master ? p.field.master.faction : null;
          const heroIds = allIds.filter((id) => CARD_MASTER[id].faction === F && isZeroCostHuman(CARD_MASTER[id]));
          const heroId = heroIds.length === 1 ? heroIds[0] : null;
          const obs = observe(p);
          const factions = Object.assign({}, obs.factions);
          if (F) factions[F] = true;
          const capOf = (id) => {
            const m = CARD_MASTER[id];
            if (isZeroCostHuman(m)) return id === heroId ? 1 : 0;
            return opt.maxCopies;
          };
          const candidateIds = (facs) => allIds.filter((id) => {
            const f = factionOf(CARD_MASTER[id]);
            return f === "common" || facs[f];
          });
          const slots = [];
          const fill = (facs) => {
            slots.length = 0;
            candidateIds(facs).forEach((id) => {
              const remain = Math.max(0, capOf(id) - (obs.seen[id] || 0));
              for (let k = 0; k < remain; k++) slots.push(id);
            });
          };
          const need = p.hand.length + p.deck.length;
          fill(factions);
          let widened = false;
          if (slots.length < need) {
            const all = /* @__PURE__ */ Object.create(null);
            allIds.forEach((id) => {
              const f = factionOf(CARD_MASTER[id]);
              if (f !== "common") all[f] = true;
            });
            fill(all);
            widened = true;
          }
          return { slots, need, factions: Object.keys(factions), heroId, seen: obs.seen, widened, F };
        }
        function determinize(st, perspective, sampleIndex, signature) {
          const opp = other(perspective);
          const p = st.players[opp];
          const handN = p.hand.length;
          const prior = buildPrior(st, opp);
          const rnd = makeRng("FAIR|" + signature + "|" + sampleIndex);
          let picked;
          if (prior.slots.length >= prior.need) picked = shuffle(prior.slots.slice(), rnd).slice(0, prior.need);
          else {
            picked = [];
            for (let i = 0; i < prior.need; i++) picked.push(prior.slots[Math.floor(rnd() * prior.slots.length)]);
          }
          const fresh = picked.map((id, i) => {
            const m = CARD_MASTER[id];
            const inst = { uid: FAIR_UID_BASE + (Number(sampleIndex) | 0) * 100 + i, cardId: id, owner: opp, master: m, accumulatedDamage: 0, equippedGoods: null, equipment: [], equippedTo: null, tracking: false, enteredTurn: -1, faceIndex: 0 };
            if (m.faces) inst.faces = m.faces.slice();
            return inst;
          });
          p.hand = fresh.slice(0, handN);
          p.deck = fresh.slice(handN);
          if (st.privateInfo) st.privateInfo[opp] = [];
          return prior;
        }
        return { determinize, buildPrior, FAIR_UID_BASE };
      }
      module.exports = { createFairDeterminizerGd1, FAIR_UID_BASE };
    }
  });

  // v010/out/unimplemented.json
  var require_unimplemented = __commonJS({
    "v010/out/unimplemented.json"(exports, module) {
      module.exports = ["MURA-016", "YAKATA-015", "YAKATA-022", "DANCHI-016", "DANCHI-018", "GAKKO-015", "GAKKO-016", "GAKKO-021", "SHOTEN-014", "SHOTEN-020", "CHIKA-015", "CHIKA-019", "SHIMA-015", "HOTEL-015", "YORU-016", "YORU-021", "YUEN-011", "YUEN-018", "CHOKOKU-018", "CHOKOKU-021"];
    }
  });

  // src/rules/L01-mori-v15.js
  var require_L01_mori_v15 = __commonJS({
    "src/rules/L01-mori-v15.js"(exports, module) {
      "use strict";
      var NEW_ID = "MORI-025";
      var V15_DECK = [
        { id: "MORI-001", count: 1 },
        // 初期        人間 0  3/2
        { id: "MORI-002", count: 4 },
        // 森人1       人間 1  2/3   ★3→4
        { id: "MORI-004", count: 4 },
        // ルピア      人間 2  2/4   ★sp 1→2
        { id: "MORI-023", count: 4 },
        // 森人7       人間 2  2/4
        { id: NEW_ID, count: 3 },
        // 森人9       人間 2  3/4   ★新規
        { id: "MORI-005", count: 4 },
        // トキ        人間 10 5/9   ★軽減 1枚ごと-1
        { id: "MORI-007", count: 4 },
        // 小獣        怪異 1  3/2
        { id: "MORI-017", count: 4 },
        // 森怪4       怪異 1  2/3
        { id: "MORI-018", count: 4 },
        // 森怪5       怪異 2  3/2
        { id: "MURA-010", count: 4 },
        // 懐中電灯    グッズ 0
        { id: "MURA-012", count: 4 }
        // 境界線      イベント 0    ★3→4
      ];
      function patchMoriV15(env) {
        const M = env.CARD_MASTER, D = env.DECKS, E = env.Effects;
        const undo = [];
        const did = [];
        if (!M[NEW_ID]) {
          M[NEW_ID] = {
            id: NEW_ID,
            name: "森人9",
            faction: "MORI",
            deck: "森",
            pool: "base",
            type: "human",
            cost: 2,
            traits: ["森"],
            attribute: null,
            attributeProvisional: true,
            effect: "効果なし",
            baseCount: 3,
            speed: 3,
            hp: 4
          };
          undo.push(() => {
            delete M[NEW_ID];
          });
          did.push("新規 " + NEW_ID + " 森人9 2コスト 3/4 〔森〕");
        }
        if (M[NEW_ID].cost !== 2 || M[NEW_ID].speed !== 3 || M[NEW_ID].hp !== 4)
          throw new Error("patch-mori-v15: " + NEW_ID + " の値が想定と違う");
        if (Array.isArray(env.GD1_ADOPTED) && env.GD1_ADOPTED.indexOf(NEW_ID) === -1) {
          env.GD1_ADOPTED.push(NEW_ID);
          undo.push(() => {
            const i = env.GD1_ADOPTED.indexOf(NEW_ID);
            if (i !== -1) env.GD1_ADOPTED.splice(i, 1);
          });
        }
        const rupia = M["MORI-004"];
        if (!rupia) throw new Error("patch-mori-v15: MORI-004 が無い");
        if (rupia.speed === 1) {
          rupia.speed = 2;
          undo.push(() => {
            rupia.speed = 1;
          });
          did.push("ルピア スピード 1 → 2");
        } else if (rupia.speed !== 2) {
          throw new Error("patch-mori-v15: ルピアのスピードが 1 でも 2 でもない（" + rupia.speed + "）");
        }
        const toki = M["MORI-005"];
        const d = E.definitions["MORI-005"];
        if (!d || typeof d.cost !== "function") throw new Error("patch-mori-v15: MORI-005 の cost が無い");
        const oldCostFn = d.cost;
        const countTrait = env.helpers.countTrait;
        d.cost = function(side, inst, m, st) {
          const n = countTrait(st.players[side].lost, "森");
          return n ? [{ delta: -n, note: "トキ：ロストの〔森〕1枚ごとに-" + n }] : [];
        };
        undo.push(() => {
          d.cost = oldCostFn;
        });
        did.push("トキ 軽減 2枚ごと-1 → 1枚ごと-1");
        if (toki.effect.indexOf("2枚あるごとに") !== -1) {
          const oldText = toki.effect;
          toki.effect = oldText.replace("特徴〔森〕を持つカードが2枚あるごとに", "特徴〔森〕を持つカードが1枚あるごとに");
          undo.push(() => {
            toki.effect = oldText;
          });
        }
        const deck = D["gd1-mori-a"];
        if (!deck) throw new Error("patch-mori-v15: gd1-mori-a が無い");
        const oldMain = deck.mainDeck, oldLabel = deck.label;
        const total = V15_DECK.reduce((a, e) => a + e.count, 0);
        if (total !== 40) throw new Error("patch-mori-v15: 合計が " + total + "枚（40でない）");
        const over = V15_DECK.filter((e) => e.count > 4);
        if (over.length) throw new Error("patch-mori-v15: 同名4枚超 " + over.map((e) => e.id + "×" + e.count).join(","));
        V15_DECK.forEach((e) => {
          if (!M[e.id]) throw new Error("patch-mori-v15: 未登録のカード " + e.id);
        });
        deck.mainDeck = V15_DECK.map((e) => ({ id: e.id, count: e.count }));
        deck.label = "森（トキ型 v1.5）";
        undo.push(() => {
          deck.mainDeck = oldMain;
          deck.label = oldLabel;
        });
        if (oldLabel !== deck.label) did.push("デッキ差し替え（実効人間 12 → 16、足止め・汎G3 を削除）");
        return {
          newId: NEW_ID,
          applied: did,
          restore() {
            undo.slice().reverse().forEach((f) => f());
          }
        };
      }
      module.exports = { patchMoriV15, V15_DECK, NEW_ID };
    }
  });

  // src/rules/config-r28.js
  var require_config_r28 = __commonJS({
    "src/rules/config-r28.js"(exports, module) {
      "use strict";
      module.exports = Object.freeze({
        HOTELB_NERF: "cost5,speed3",
        // ホテル② v1.6
        HOTELA_NERF: "shihai33",
        // ホテル① v1.5＋②
        YUEN_V19: "1",
        // 遊園地 v1.9（その上に v2.0・R27・R28 を重ねる）
        CHIKA_V17B: "1",
        // 地下 v1.7b
        YUEN_PARADE_MIN: "2",
        // パレードの踏み倒し下限
        YUEN_UCHIAGE_MAX: "2",
        // 打ち上げ花火の元コスト上限（R28 で文面からは外れた。旧版の層が読む値として残す）
        YORU_VARIANT: "a",
        R27_FINAL: "1",
        R28_FINAL: "1"
      });
    }
  });

  // src/rules/L02-hotelb-v15.js
  var require_L02_hotelb_v15 = __commonJS({
    "src/rules/L02-hotelb-v15.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var BAFO = "HOTEL-010";
      var LINDE = "HOTEL-017";
      var VILMA = "HOTEL-004";
      var BELL = "HOTEL-006";
      var V15_DECK = [
        { id: "HOTEL-001", count: 1 },
        // 初期        人間 0  2/3
        { id: "HOTEL-002", count: 4 },
        // ホ人1       人間 1  2/3   ★3→4
        { id: "HOTEL-003", count: 4 },
        // マルグリット 人間 2  2/4
        { id: VILMA, count: 3 },
        // ヴィルマ     人間 2  1/5   ★2/3→1/5
        { id: LINDE, count: 4 },
        // リンデ       人間 3  2/5   ★4コスト3/6→3コスト2/5、2→4枚
        { id: BELL, count: 4 },
        // 呼び鈴       怪異 1  2/2   ★効果変更、3→4枚
        { id: "HOTEL-007", count: 4 },
        // 客室係       怪異 2  3/4   ★3→4
        { id: BAFO, count: 4 },
        // バフォメット  怪異 4  4/8   ★5コスト3/8→4コスト4/8、2→4枚
        { id: "MURA-010", count: 4 },
        // 懐中電灯     グッズ 0      ★2→4
        { id: "MURA-012", count: 4 },
        // 境界線       イベント 0    ★3→4
        { id: "HOTEL-012", count: 4 }
        // 深夜営業     イベント 1    ★3→4
      ];
      function patchHotelBV15(env) {
        const NERF = String(CONFIG.HOTELB_NERF || "").split(",").filter(Boolean);
        const M = env.CARD_MASTER, D = env.DECKS, E = env.Effects;
        const { hasTrait, otherSide } = env.helpers;
        const MAX_HUMANS = env.constants.MAX_HUMANS;
        const Game = env.Game;
        const undo = [], did = [];
        const nameOf = (c) => c.master.name;
        const b = M[BAFO];
        if (!b) throw new Error("patch-hotelb-v15: " + BAFO + " が無い");
        if (b.cost === 5) {
          b.cost = 4;
          undo.push(() => {
            b.cost = 5;
          });
          did.push("バフォメット コスト 5→4");
        } else if (b.cost !== 4) throw new Error("patch-hotelb-v15: バフォメットのコストが 5 でも 4 でもない（" + b.cost + "）");
        if (b.speed === 3) {
          b.speed = 4;
          undo.push(() => {
            b.speed = 3;
          });
          did.push("バフォメット スピード 3→4");
        } else if (b.speed !== 4) throw new Error("patch-hotelb-v15: バフォメットのスピードが 3 でも 4 でもない（" + b.speed + "）");
        if (NERF.indexOf("speed3") !== -1) {
          b.speed = 3;
          did.push("★削り: スピード 4→3 に戻す");
        }
        if (NERF.indexOf("cost5") !== -1) {
          b.cost = 5;
          did.push("★切り分け: コスト 4→5 に戻す");
        }
        if (b.traits.indexOf("悪魔") === -1) {
          const old = b.traits.slice();
          b.traits = old.concat(["悪魔"]);
          undo.push(() => {
            b.traits = old;
          });
        }
        const l = M[LINDE];
        if (!l || l.name.indexOf("リンデ") === -1) throw new Error("patch-hotelb-v15: " + LINDE + " がリンデでない");
        if (l.cost === 4) {
          l.cost = 3;
          l.speed = 2;
          l.hp = 5;
          undo.push(() => {
            l.cost = 4;
            l.speed = 3;
            l.hp = 6;
          });
          did.push("リンデ 4コスト3/6 → 3コスト2/5");
        } else if (!(l.cost === 3 && l.speed === 2 && l.hp === 5)) throw new Error("patch-hotelb-v15: リンデの値が想定外");
        if (NERF.indexOf("linde4") !== -1) {
          l.cost = 4;
          did.push("★削り: リンデを4コストに戻す（身体は2/5のまま）");
        }
        const v = M[VILMA];
        if (v.speed === 2 && v.hp === 3) {
          v.speed = 1;
          v.hp = 5;
          undo.push(() => {
            v.speed = 2;
            v.hp = 3;
          });
          did.push("ヴィルマ 2/3 → 1/5");
        } else if (!(v.speed === 1 && v.hp === 5)) throw new Error("patch-hotelb-v15: ヴィルマの値が想定外");
        const bd = E.definitions[BAFO];
        if (!bd || typeof bd.enter !== "function") throw new Error("patch-hotelb-v15: バフォメットの enter が無い");
        const oldEnter = bd.enter;
        bd.enter = function(ctx, done) {
          if (!hasTrait(ctx.me.field, "ホテル")) {
            ctx.log("不発：フィールドが〔ホテル〕ではない");
            done();
            return;
          }
          const opp = otherSide(ctx.side), P = ctx.opponent;
          if (P.humans.length >= MAX_HUMANS) {
            ctx.log("不発：相手の人間エリアが上限");
            done();
            return;
          }
          const cands = P.hand.filter((c) => {
            const m = c.faces ? env.CARD_MASTER[c.faces[0]] : c.master;
            if (!m || m.type !== "human") return false;
            const r = Game.canPlay(opp, c, { free: true });
            return r && r.ok;
          });
          if (!cands.length) {
            ctx.log("不発：相手が出せる人間がありません");
            done();
            return;
          }
          ctx.pickCards({
            title: nameOf(ctx.source) + "（相手の手札を見る）",
            message: "相手の場にコストを支払わずに出させる人間を1枚選んでください",
            cards: cands,
            count: 1,
            mode: "exact"
          }, (chosen) => {
            const c = chosen && chosen[0];
            if (!c) {
              done();
              return;
            }
            const r = Game.playUnit(opp, c, { free: true, byEffect: true, controller: ctx.side });
            if (!r.ok) ctx.log("不発：" + r.reasons.join("／"));
            done();
          });
        };
        undo.push(() => {
          bd.enter = oldEnter;
        });
        did.push("バフォメット登場時：相手が選ぶ → こちらが相手の手札を見て選ぶ");
        const oldBText = b.effect;
        if (b.effect.indexOf("相手は自分の手札から人間1枚を選び") !== -1) {
          b.effect = "【二重追跡】／【登場時】自分のフィールドが特徴〔ホテル〕を持つなら、相手の手札を見る。その中から人間1枚を選び、相手の場にコストを支払わずに出す／相手のターン開始時に回復する気力を-1する。この効果は重複しない";
          undo.push(() => {
            b.effect = oldBText;
          });
        }
        if (NERF.indexOf("noDrain") !== -1) {
          const t = b.effect;
          if (t.indexOf("相手のターン開始時に回復する気力を-1する") !== -1) {
            b.effect = t.replace(/／?相手のターン開始時に回復する気力を-1する。この効果は重複しない/, "");
            undo.push(() => {
              b.effect = t;
            });
            did.push("★削り: 相手の収入-1 を外す");
          }
        }
        const belld = E.definitions[BELL];
        if (!belld || typeof belld.leave !== "function") throw new Error("patch-hotelb-v15: 呼び鈴の leave が無い");
        const oldLeave = belld.leave;
        belld.leave = function(ctx, done) {
          const looked = Game.lookTopOfDeck(ctx.side, 1);
          ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
          if (!looked.length) {
            done();
            return;
          }
          const cands = looked.filter((c) => {
            const t = c.master.type;
            return (t === "human" || t === "youkai") && hasTrait(c, "ホテル");
          });
          const finish = (taken) => {
            Game.resolveLook(ctx.side, looked, taken, false, "choose");
            ctx.showCards(taken, done);
          };
          if (!cands.length) {
            finish([]);
            return;
          }
          ctx.pickCards(
            { title: nameOf(ctx.source), message: "手札に加えるカードを選んでください", cards: looked, selectable: cands, count: 1, mode: "max" },
            (chosen) => finish(chosen || [])
          );
        };
        undo.push(() => {
          belld.leave = oldLeave;
        });
        did.push("呼び鈴：対象を「支配人」→「〔ホテル〕の人間/怪異」へ");
        const bell = M[BELL], oldBellText = bell.effect;
        if (bell.effect.indexOf("「支配人」") !== -1) {
          bell.effect = "【離れた時】自分のデッキの上から1枚を見る。それが特徴〔ホテル〕を持つ人間/怪異なら、手札に加えることができる。手札に加えなかったなら、デッキの下に置く";
          undo.push(() => {
            bell.effect = oldBellText;
          });
        }
        const deck = D["gd1-hotel-b"];
        if (!deck) throw new Error("patch-hotelb-v15: gd1-hotel-b が無い");
        const total = V15_DECK.reduce((a, e) => a + e.count, 0);
        if (total !== 40) throw new Error("patch-hotelb-v15: 合計が " + total + "枚（40でない）");
        const over = V15_DECK.filter((e) => e.count > 4);
        if (over.length) throw new Error("patch-hotelb-v15: 同名4枚超 " + over.map((e) => e.id + "×" + e.count).join(","));
        V15_DECK.forEach((e) => {
          if (!M[e.id]) throw new Error("patch-hotelb-v15: 未登録のカード " + e.id);
        });
        const oldMain = deck.mainDeck, oldLabel = deck.label;
        deck.mainDeck = V15_DECK.map((e) => ({ id: e.id, count: e.count }));
        deck.label = "ホテル②（バフォメット型 v1.5）";
        undo.push(() => {
          deck.mainDeck = oldMain;
          deck.label = oldLabel;
        });
        if (oldLabel !== deck.label) did.push("デッキ差し替え（17種 → 11種、二重追跡はバフォメットのみ）");
        return { applied: did, restore() {
          undo.slice().reverse().forEach((f) => f());
        } };
      }
      module.exports = { patchHotelBV15, V15_DECK };
    }
  });

  // src/rules/L03-yoru-v15.js
  var require_L03_yoru_v15 = __commonJS({
    "src/rules/L03-yoru-v15.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var FIELD = "FIELD-YORU";
      var MACHI4 = "YORU-005";
      var KAGE_A = "YORU-007";
      var KAIBUTSU = "YORU-009";
      var KAIBUTSU_DAI = "YORU-010";
      var KYOJIN = "YORU-011";
      var TICKET = "YORU-025";
      var V15_DECK = [
        { id: "YORU-001", count: 1 },
        // 初期        人間 0  2/3
        { id: "YORU-003", count: 4 },
        // 街人2       人間 1  3/2   ★2→4
        { id: "YORU-002", count: 1 },
        // 街人1       人間 1  2/3
        { id: MACHI4, count: 4 },
        // 街人4       人間 2  3/4   ★効果追加、1→4
        { id: "YORU-004", count: 4 },
        // 街人3       人間 2  2/4   ★3→4
        { id: KAGE_A, count: 4 },
        // 影の人A     怪異 1  2/2   ★登場時→離れた時、3→4
        { id: KAIBUTSU, count: 4 },
        // 怪物        怪異 2  3/4   ★C3→C2、効果変更
        { id: KAIBUTSU_DAI, count: 2 },
        // 怪物（大）  怪異 4  4/7   ★効果簡素化、1→2
        { id: KYOJIN, count: 4 },
        // ビルの巨人  怪異 3  3/5   ★C5 4/8→C3 3/5、2→4
        { id: TICKET, count: 4 },
        // 終電の切符  グッズ 1      ★プールから・新規実装
        { id: "MURA-012", count: 4 },
        // 境界線      イベント 0    ★3→4
        { id: "YORU-013", count: 4 }
        // 霧          イベント 2    ★3→4
      ];
      function patchYoruV15(env) {
        const NERF = String(CONFIG.YORU_NERF || "").split(",").filter(Boolean);
        const M = env.CARD_MASTER, D = env.DECKS, E = env.Effects;
        const { hasTrait, otherSide } = env.helpers;
        const Game = env.Game;
        const undo = [], did = [];
        const nameOf = (c) => c.master.name;
        const THRESH = NERF.indexOf("thresh2") !== -1 ? 2 : NERF.indexOf("thresh4") !== -1 ? 4 : 3;
        const REDUCE = NERF.indexOf("reduce2") !== -1 ? 2 : 1;
        if (THRESH !== 3) did.push("★削り: フィールドの閾値を " + THRESH + "枚以下 に");
        if (REDUCE !== 1) did.push("★調整: 軽減を " + REDUCE + " に");
        const k = M[KAIBUTSU];
        if (k.cost === 3) {
          k.cost = 2;
          undo.push(() => {
            k.cost = 3;
          });
          did.push("怪物 C3→C2");
        } else if (k.cost !== 2) throw new Error("patch-yoru-v15: 怪物のコストが想定外（" + k.cost + "）");
        const ky = M[KYOJIN];
        const KY_HP = NERF.indexOf("kyojin34") !== -1 ? 4 : 5;
        if (ky.cost === 5) {
          ky.cost = 3;
          ky.speed = 3;
          ky.hp = KY_HP;
          undo.push(() => {
            ky.cost = 5;
            ky.speed = 4;
            ky.hp = 8;
          });
          did.push("ビルの巨人 C5 4/8 → C3 3/" + KY_HP);
        } else if (ky.cost === 3 && ky.speed === 3 && (ky.hp === 4 || ky.hp === 5)) {
          ky.hp = KY_HP;
        } else throw new Error("patch-yoru-v15: ビルの巨人の値が想定外（C" + ky.cost + " " + ky.speed + "/" + ky.hp + "）");
        if (KY_HP === 4) did.push("★削り: ビルの巨人 3/5→3/4");
        const fd = E.definitions[FIELD];
        if (fd && fd.targetImmunityFor) {
          const oldTIF = fd.targetImmunityFor;
          delete fd.targetImmunityFor;
          undo.push(() => {
            fd.targetImmunityFor = oldTIF;
          });
          did.push("フィールド：「選ばれない」を撤去");
        }
        const oCalc = Game._calcYoukaiReduction;
        Game._calcYoukaiReduction = function(yk, side) {
          let total2 = oCalc.call(this, yk, side);
          const me = this.state.players[side];
          if (hasTrait(yk, "夜の街") && hasTrait(me.field, "夜の街") && this.state.players[otherSide(side)].hand.length <= THRESH) total2 += REDUCE;
          return total2;
        };
        undo.push(() => {
          Game._calcYoukaiReduction = oCalc;
        });
        did.push("フィールド：相手の手札" + THRESH + "枚以下なら〔夜の街〕怪異の被ダメ-" + REDUCE);
        const fm = M[FIELD], oldFText = fm.effect;
        fm.effect = "相手の手札が" + THRESH + "枚以下なら、自分の特徴〔夜の街〕を持つ怪異は、相手の人間から受けるダメージを" + REDUCE + "軽減する。";
        undo.push(() => {
          fm.effect = oldFText;
        });
        const gate = (ctx) => hasTrait(ctx.me.field, "夜の街");
        function oppDiscards(ctx, n, done, cause) {
          const opp = otherSide(ctx.side), hand = ctx.opponent.hand.slice();
          if (!hand.length) {
            ctx.log("相手の手札がないため捨てません");
            done();
            return;
          }
          const kk = Math.min(n, hand.length);
          ctx.oppOps().pickCards(
            { title: nameOf(ctx.source) + "（相手の効果）", message: "トラッシュへ置く手札を" + kk + "枚選んでください", cards: hand, count: kk, mode: "exact" },
            (chosen) => {
              Game.discardFromHand(opp, chosen, cause || nameOf(ctx.source));
              done();
            }
          );
        }
        function lookerDiscards(ctx, n, done) {
          const opp = otherSide(ctx.side), hand = ctx.opponent.hand.slice();
          Game.recordHandLook(ctx.side, hand);
          ctx.log("手札を見た：" + ctx.me.label + " → " + ctx.opponent.label + "の手札" + hand.length + "枚（見た側だけが知る）");
          if (!hand.length) {
            done();
            return;
          }
          const kk = Math.min(n, hand.length);
          ctx.pickCards(
            { title: nameOf(ctx.source), message: "相手の手札から捨てるカードを" + kk + "枚選んでください", cards: hand, count: kk, mode: "exact", privateView: true },
            (chosen) => {
              Game.discardFromHand(opp, chosen, nameOf(ctx.source));
              done();
            }
          );
        }
        function setHook(id, kind, fn, note) {
          const d = E.definitions[id] || (E.definitions[id] = {});
          const old = Object.prototype.hasOwnProperty.call(d, kind) ? d[kind] : void 0;
          d[kind] = fn;
          undo.push(() => {
            if (old === void 0) delete d[kind];
            else d[kind] = old;
          });
          if (note) did.push(note);
        }
        function dropHook(id, kind, note) {
          const d = E.definitions[id];
          if (!d || d[kind] === void 0) return;
          const old = d[kind];
          delete d[kind];
          undo.push(() => {
            d[kind] = old;
          });
          if (note) did.push(note);
        }
        setHook(MACHI4, "enter", function(ctx, done) {
          const hand = ctx.opponent.hand.slice();
          Game.recordHandLook(ctx.side, hand);
          ctx.log("街人4：相手の手札を見た（" + hand.length + "枚・見た側だけが知る）");
          ctx.showCards(hand, done);
        }, "街人4：【登場時】相手の手札を見る を新設");
        dropHook(KAGE_A, "enter", "影の人A：【登場時】を撤去");
        setHook(KAGE_A, "leave", function(ctx, done) {
          if (!gate(ctx)) {
            ctx.log("不発：フィールドが〔夜の街〕ではない");
            done();
            return;
          }
          oppDiscards(ctx, 1, done, "影の人A");
        }, "影の人A：【離れた時】相手が1枚捨てる");
        dropHook(KAIBUTSU, "static", "怪物：閾値パンプを撤去");
        setHook(KAIBUTSU, "enter", function(ctx, done) {
          if (!gate(ctx)) {
            ctx.log("不発：フィールドが〔夜の街〕ではない");
            done();
            return;
          }
          Game.discardRandomFromHand(otherSide(ctx.side), 1, "怪物");
          done();
        }, "怪物：【登場時】ランダム1枚");
        setHook(KAIBUTSU_DAI, "enter", function(ctx, done) {
          if (!gate(ctx)) {
            ctx.log("不発：フィールドが〔夜の街〕ではない");
            done();
            return;
          }
          Game.discardRandomFromHand(otherSide(ctx.side), 1, "怪物（大）");
          done();
        }, "怪物（大）：【登場時】ランダム1枚のみに");
        dropHook(KYOJIN, "static", "ビルの巨人：閾値パンプを撤去");
        setHook(KYOJIN, "enter", function(ctx, done) {
          if (!gate(ctx)) {
            ctx.log("不発：フィールドが〔夜の街〕ではない");
            done();
            return;
          }
          lookerDiscards(ctx, 1, done);
        }, "ビルの巨人：【登場時】見て1枚");
        if (NERF.indexOf("noTicket") === -1) {
          setHook(TICKET, "ownAssault", function(ctx, done) {
            if (!ctx.item.humansLost) {
              done();
              return;
            }
            oppDiscards(ctx, 1, done, "終電の切符");
          }, "★終電の切符：【自分の襲撃時】を新規実装（元は死札）");
        }
        const texts = {
          [MACHI4]: "【登場時】相手の手札を見る",
          [KAGE_A]: "【離れた時】自分のフィールドが特徴〔夜の街〕を持つなら、相手は自分の手札1枚を捨てる",
          [KAIBUTSU]: "【登場時】自分のフィールドが特徴〔夜の街〕を持つなら、相手の手札からランダムに1枚を捨てる",
          [KAIBUTSU_DAI]: "【登場時】自分のフィールドが特徴〔夜の街〕を持つなら、相手の手札からランダムに1枚を捨てる",
          [KYOJIN]: "【登場時】自分のフィールドが特徴〔夜の街〕を持つなら、相手の手札を見て、その中から1枚を捨てる"
        };
        Object.keys(texts).forEach((id) => {
          const m = M[id], old = m.effect;
          if (old !== texts[id]) {
            m.effect = texts[id];
            undo.push(() => {
              m.effect = old;
            });
          }
        });
        const deck = D["gd1-yoru"];
        if (!deck) throw new Error("patch-yoru-v15: gd1-yoru が無い");
        let list = V15_DECK.slice();
        if (NERF.indexOf("noTicket") !== -1) list = list.map((e) => e.id === TICKET ? { id: "YORU-012", count: 4 } : e);
        const total = list.reduce((a, e) => a + e.count, 0);
        if (total !== 40) throw new Error("patch-yoru-v15: 合計が " + total + "枚（40でない）");
        const over = list.filter((e) => e.count > 4);
        if (over.length) throw new Error("patch-yoru-v15: 同名4枚超 " + over.map((e) => e.id + "×" + e.count).join(","));
        list.forEach((e) => {
          if (!M[e.id]) throw new Error("patch-yoru-v15: 未登録のカード " + e.id);
        });
        const oldMain = deck.mainDeck, oldLabel = deck.label;
        deck.mainDeck = list.map((e) => ({ id: e.id, count: e.count }));
        deck.label = "夜の街 v1.5";
        undo.push(() => {
          deck.mainDeck = oldMain;
          deck.label = oldLabel;
        });
        if (oldLabel !== deck.label) did.push("デッキ差し替え（17種 → 12種、閾値パンプを全廃）");
        return { applied: did, threshold: THRESH, reduce: REDUCE, restore() {
          undo.slice().reverse().forEach((f) => f());
        } };
      }
      module.exports = { patchYoruV15, V15_DECK };
    }
  });

  // src/rules/L04-hotela-v15.js
  var require_L04_hotela_v15 = __commonJS({
    "src/rules/L04-hotela-v15.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var SHIHAI = "HOTEL-008";
      var GOANNAI = "HOTEL-011";
      var VILMA = "HOTEL-004";
      var LINDE = "HOTEL-017";
      var BELL = "HOTEL-006";
      var V15_DECK = [
        { id: "HOTEL-001", count: 1 },
        // 初期        人間 0  2/3
        { id: "HOTEL-002", count: 4 },
        // ホ人1       人間 1  2/3   ★3→4
        { id: "HOTEL-003", count: 4 },
        // マルグリット 人間 2  2/4
        { id: VILMA, count: 3 },
        // ヴィルマ     人間 2  1/5   ★2/3→1/5
        { id: LINDE, count: 2 },
        // リンデ       人間 3  2/5   ★C4 3/6→C3 2/5、新規採用
        { id: BELL, count: 4 },
        // 呼び鈴       怪異 1  2/2   ★効果変更
        { id: SHIHAI, count: 4 },
        // 支配人       怪異 2  3/4   ★C3→C2
        { id: "HOTEL-007", count: 4 },
        // 客室係       怪異 2  3/4   ★3→4
        { id: "MURA-010", count: 4 },
        // 懐中電灯     グッズ 0      ★2→4
        { id: "MURA-012", count: 4 },
        // 境界線       イベント 0    ★3→4
        { id: GOANNAI, count: 4 },
        // ご案内       イベント 1    ★効果変更、3→4
        { id: "HOTEL-012", count: 2 }
        // 深夜営業     イベント 1
      ];
      function patchHotelAV15(env) {
        const NERF = String(CONFIG.HOTELA_NERF || "").split(",").filter(Boolean);
        const M = env.CARD_MASTER, D = env.DECKS, E = env.Effects;
        const { hasTrait, otherSide } = env.helpers;
        const Game = env.Game;
        const MAX_HUMANS = env.constants.MAX_HUMANS;
        const undo = [], did = [];
        const nameOf = (c) => c.master.name;
        const DRAW = NERF.indexOf("noDraw") === -1;
        const s = M[SHIHAI];
        if (!s || s.name !== "支配人") throw new Error("patch-hotela-v15: " + SHIHAI + " が支配人でない");
        if (String(s.effect).indexOf("【二重追跡】") === -1) throw new Error("patch-hotela-v15: 支配人が【二重追跡】を持っていない");
        const S_COST = NERF.indexOf("shihai3c") !== -1 ? 3 : 2;
        const S_HP = NERF.indexOf("shihai33") !== -1 ? 3 : 4;
        if (s.cost === 3 && s.hp === 4) {
          s.cost = S_COST;
          s.hp = S_HP;
          undo.push(() => {
            s.cost = 3;
            s.hp = 4;
          });
          did.push("支配人 C3 3/4 → C" + S_COST + " 3/" + S_HP);
        } else if ((s.cost === 2 || s.cost === 3) && (s.hp === 3 || s.hp === 4)) {
          s.cost = S_COST;
          s.hp = S_HP;
        } else throw new Error("patch-hotela-v15: 支配人の値が想定外（C" + s.cost + " " + s.speed + "/" + s.hp + "）");
        if (S_COST === 3) did.push("★切り分け: 支配人を3コストに戻す");
        if (S_HP === 3) did.push("★削り: 支配人 3/4→3/3");
        const v = M[VILMA];
        if (v.speed === 2 && v.hp === 3) {
          v.speed = 1;
          v.hp = 5;
          undo.push(() => {
            v.speed = 2;
            v.hp = 3;
          });
          did.push("ヴィルマ 2/3 → 1/5");
        } else if (!(v.speed === 1 && v.hp === 5)) throw new Error("patch-hotela-v15: ヴィルマの値が想定外");
        const l = M[LINDE];
        if (!l || l.name.indexOf("リンデ") === -1) throw new Error("patch-hotela-v15: " + LINDE + " がリンデでない");
        if (l.cost === 4 && l.speed === 3 && l.hp === 6) {
          l.cost = 3;
          l.speed = 2;
          l.hp = 5;
          undo.push(() => {
            l.cost = 4;
            l.speed = 3;
            l.hp = 6;
          });
          did.push("リンデ C4 3/6 → C3 2/5");
        } else if (!(l.cost === 3 && l.speed === 2 && l.hp === 5)) throw new Error("patch-hotela-v15: リンデの値が想定外");
        const bd = E.definitions[BELL];
        if (!bd) throw new Error("patch-hotela-v15: 呼び鈴の定義が無い");
        const oldLeave = bd.leave;
        bd.leave = function(ctx, done) {
          const looked = Game.lookTopOfDeck(ctx.side, 1);
          ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label + "（呼び鈴）");
          if (!looked.length) {
            done();
            return;
          }
          const cands = looked.filter((c) => {
            const m = c.faces ? M[c.faces[0]] : c.master;
            return m && (m.type === "human" || m.type === "youkai") && (m.traits || []).indexOf("ホテル") !== -1;
          });
          const finish = (taken) => {
            Game.resolveLook(ctx.side, looked, taken, false, "choose");
            ctx.showCards(taken, done);
          };
          if (!cands.length) {
            finish([]);
            return;
          }
          ctx.pickCards(
            { title: nameOf(ctx.source), message: "手札に加えるカードを選んでください（0〜1枚）", cards: looked, selectable: cands, count: 1, mode: "max" },
            (chosen) => finish(chosen || [])
          );
        };
        undo.push(() => {
          bd.leave = oldLeave;
        });
        did.push("呼び鈴：対象を「支配人」→「〔ホテル〕の人間/怪異」へ");
        const bm = M[BELL];
        if (bm.effect.indexOf("「支配人」") !== -1) {
          const old = bm.effect;
          bm.effect = old.replace("それが「支配人」なら", "それが特徴〔ホテル〕を持つ人間/怪異なら");
          undo.push(() => {
            bm.effect = old;
          });
        }
        const gd = E.definitions[GOANNAI];
        if (!gd || typeof gd.event !== "function") throw new Error("patch-hotela-v15: ご案内の event が無い");
        const oldEvent = gd.event;
        gd.event = function(ctx, done) {
          if (!hasTrait(ctx.me.field, "ホテル")) {
            ctx.log("不発：フィールドが〔ホテル〕ではない");
            done();
            return;
          }
          const opp = otherSide(ctx.side), P = ctx.opponent;
          if (P.humans.length >= MAX_HUMANS) {
            ctx.log("不発：相手の人間エリアが上限");
            done();
            return;
          }
          const hand = P.hand.slice();
          const cands = hand.filter((c) => {
            const m = c.faces ? M[c.faces[0]] : c.master;
            if (!m || m.type !== "human") return false;
            const r = Game.canPlay(opp, c, { free: true });
            return r && r.ok;
          });
          if (!cands.length) {
            ctx.log("不発：相手が出せる人間がありません");
            done();
            return;
          }
          Game.recordHandLook(ctx.side, hand);
          ctx.log("ご案内：相手の手札を見た（" + hand.length + "枚・見た側だけが知る）");
          ctx.pickCards({
            title: nameOf(ctx.source) + "（相手の手札を見る）",
            message: "相手の場にコストを支払わずに出させる人間を1枚選んでください",
            cards: hand,
            selectable: cands,
            count: 1,
            mode: "exact",
            privateView: true
          }, (chosen) => {
            const c = chosen && chosen[0];
            if (!c) {
              done();
              return;
            }
            const r = Game.playUnit(opp, c, { free: true, byEffect: true, controller: ctx.side });
            if (!r.ok) {
              ctx.log("不発：" + r.reasons.join("／"));
              done();
              return;
            }
            if (DRAW && !ctx.isOver()) {
              Game.drawOne(ctx.side);
              ctx.log("ご案内：自分は1枚ドロー");
            }
            done();
          });
        };
        undo.push(() => {
          gd.event = oldEvent;
        });
        did.push("★ご案内：決定者を「相手」→「持ち主」へ／〔ホテル〕ゲート新設" + (DRAW ? "／成功時に1ドロー" : "／★削り: ドローなし"));
        const gm = M[GOANNAI], oldGText = gm.effect;
        gm.effect = "【1ターン1枚】自分のフィールドが特徴〔ホテル〕を持つなら、相手の手札を見る。その中から人間1枚を選び、相手の場にコストを支払わずに出す。" + (DRAW ? "その後、自分は1枚ドローする。" : "");
        if (oldGText !== gm.effect) undo.push(() => {
          gm.effect = oldGText;
        });
        const deck = D["gd1-hotel-a"];
        if (!deck) throw new Error("patch-hotela-v15: gd1-hotel-a が無い");
        let list = V15_DECK.map((e) => ({ id: e.id, count: e.count }));
        if (NERF.indexOf("midnight4") !== -1) {
          list = list.map((e) => e.id === "HOTEL-012" ? { id: e.id, count: 4 } : e.id === "HOTEL-002" ? { id: e.id, count: 2 } : e);
          did.push("★調整: 深夜営業 2→4枚 / ホ人1 4→2枚");
        }
        const total = list.reduce((a, e) => a + e.count, 0);
        if (total !== 40) throw new Error("patch-hotela-v15: 合計が " + total + "枚（40でない）");
        const over = list.filter((e) => e.count > 4);
        if (over.length) throw new Error("patch-hotela-v15: 同名4枚超 " + over.map((e) => e.id + "×" + e.count).join(","));
        list.forEach((e) => {
          if (!M[e.id]) throw new Error("patch-hotela-v15: 未登録のカード " + e.id);
        });
        const oldMain = deck.mainDeck, oldLabel = deck.label;
        deck.mainDeck = list;
        deck.label = "ホテル①（支配人型 v1.5）";
        undo.push(() => {
          deck.mainDeck = oldMain;
          deck.label = oldLabel;
        });
        if (oldLabel !== deck.label) did.push("デッキ差し替え（17種 → 12行40枚・ボイラー/バフォメット/ホ人3/汎G3 を削除）");
        return { applied: did, shihaiCost: S_COST, shihaiHp: S_HP, draw: DRAW, restore() {
          undo.slice().reverse().forEach((f) => f());
        } };
      }
      module.exports = { patchHotelAV15, V15_DECK };
    }
  });

  // src/rules/L05-yuen-v15.js
  var require_L05_yuen_v15 = __commonJS({
    "src/rules/L05-yuen-v15.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var FIELD = "FIELD-YUEN";
      var PARADE = "YUEN-009";
      var SORA = "YUEN-005";
      var KAII3 = "YUEN-008";
      var PHOTO = "YUEN-027";
      var VIEW = "YUEN-031";
      var HANABI = "YUEN-028";
      var NIGHT = "YUEN-030";
      var UCHIAGE = "YUEN-032";
      var GATE = "YUEN-033";
      var G6 = "COMMON-007";
      var UCHI2 = "YUEN-034";
      var V15_DECK_PROVISIONAL = [
        { id: "YUEN-001", count: 1 },
        // 初期        人間 0  2/3
        { id: "YUEN-002", count: 3 },
        // 園人1       人間 1  2/3   ★暫定 4→3
        { id: "YUEN-004", count: 4 },
        // 園人3       人間 2  3/4
        { id: SORA, count: 3 },
        // ソラ        人間 3  2/4   ★暫定 4→3
        { id: "YUEN-006", count: 3 },
        // 園怪1       怪異 1  3/2   ★暫定 4→3
        { id: "YUEN-007", count: 3 },
        // 園怪2       怪異 2  3/4   ★暫定 4→3
        { id: PARADE, count: 4 },
        // パレード    怪異 8  4/6   ★改訂
        { id: G6, count: 2 },
        // 汎G6        グッズ 0      ★新規
        { id: VIEW, count: 4 },
        // 見晴らし    イベント 1
        { id: PHOTO, count: 4 },
        // 写真館改    イベント 1    ★改訂
        { id: HANABI, count: 3 },
        // 花火        イベント 3
        { id: UCHIAGE, count: 2 },
        // 打ち上げ花火 イベント 3   ★新規
        { id: GATE, count: 2 },
        // 閉園ゲート   イベント 3   ★新規
        { id: NIGHT, count: 2 }
        // ナイトサファリ イベント 3 ★改訂
      ];
      var V16_DECK = [
        { id: "YUEN-001", count: 1 },
        // 初期        人間 0  2/3
        { id: "YUEN-002", count: 4 },
        // 園人1       人間 1  2/3   ★v1.5の3→4（人間を戻す）
        { id: "YUEN-004", count: 4 },
        // 園人3       人間 2  3/4
        { id: SORA, count: 4 },
        // ソラ        人間 2  3/4   ★C3 2/4→C2 3/4・対象を元コスト1以下／3→4
        { id: "YUEN-006", count: 3 },
        // 園怪1       怪異 1  3/2
        { id: "YUEN-007", count: 3 },
        // 園怪2       怪異 2  3/4
        { id: PARADE, count: 4 },
        // パレード    怪異 6  3/4   ★C8 4/6→C6 3/4・シャッフルしない
        { id: VIEW, count: 4 },
        // 見晴らし    イベント 1
        { id: PHOTO, count: 4 },
        // 写真館改    イベント 1
        { id: HANABI, count: 3 },
        // 花火        イベント 3
        { id: UCHIAGE, count: 2 },
        // 打ち上げ花火 イベント 3
        { id: GATE, count: 2 },
        // 閉園ゲート   イベント 3
        { id: NIGHT, count: 2 }
        // ナイトサファリ イベント 3
      ];
      var V18_DECK = V16_DECK.map((e) => e.id === "YUEN-007" ? { id: e.id, count: 2 } : e.id === HANABI ? { id: e.id, count: 4 } : { id: e.id, count: e.count });
      var V19_DECK = [
        { id: "YUEN-001", count: 1 },
        // 初期        人間 0  2/3
        { id: "YUEN-002", count: 4 },
        // 園人1       人間 1  2/3
        { id: "YUEN-004", count: 4 },
        // 園人3       人間 2  3/4
        { id: SORA, count: 4 },
        // ソラ        人間 2  3/4
        { id: "YUEN-006", count: 3 },
        // 園怪1       怪異 1  3/2
        { id: "YUEN-007", count: 2 },
        // 園怪2       怪異 2  3/4
        { id: PARADE, count: 4 },
        // パレード    怪異 10 3/4
        { id: VIEW, count: 4 },
        // 見晴らし    イベント 1
        { id: PHOTO, count: 4 },
        // 写真館改    イベント 1
        { id: HANABI, count: 4 },
        // 花火        イベント 3  ★全体2に戻す
        { id: GATE, count: 2 },
        // 閉園ゲート   イベント 3
        { id: NIGHT, count: 2 },
        // ナイトサファリ イベント 3
        { id: UCHI2, count: 2 }
        // 打ち上げ     イベント 3  ★新規
      ];
      function patchYuenV15(env) {
        const NERF = String(CONFIG.YUEN_NERF || "").split(",").map((s) => s.trim()).filter(Boolean);
        const has = (f) => NERF.indexOf(f) !== -1;
        const V19 = String(CONFIG.YUEN_V19 || "") === "1";
        const V18 = String(CONFIG.YUEN_V18 || "") === "1";
        const V17 = V19 || V18 || String(CONFIG.YUEN_V17 || "") === "1";
        const V16 = V17 || String(CONFIG.YUEN_V16 || "") === "1";
        const M = env.CARD_MASTER, D = env.DECKS, E = env.Effects;
        const { hasTrait, otherSide, originalCost } = env.helpers;
        const Game = env.Game;
        const MAX_YOUKAI = env.constants.MAX_YOUKAI;
        const undo = [], did = [];
        const nameOf = (c) => c.master.name;
        const yuenEvent = (c) => c && c.master && c.master.type === "event" && hasTrait(c, "遊園地");
        const FLOOR = has("floor4") ? 4 : 1;
        const P_DIV = V17 ? 1 : 2;
        const P_COST = V17 ? has("parade39") ? 9 : 10 : V16 ? 6 : 8;
        const P_SPEED = V16 ? 3 : has("parade36") ? 3 : 4;
        const P_HP = V16 ? has("parade35") ? 5 : 4 : 6;
        const P_SPEED2 = V16 ? has("parade24") ? 2 : P_SPEED : P_SPEED;
        const SORA_COST = V16 ? 2 : 3;
        const SORA_SPEED = V16 ? has("sora24") ? 2 : 3 : 2;
        const SORA_HP = 4;
        const REPLAY_MAX = has("replay2") ? 2 : Infinity;
        const PARADE_MIN = Number(CONFIG.YUEN_PARADE_MIN || 3) | 0;
        const UCHI_MAX = CONFIG.YUEN_UCHIAGE_MAX ? Number(CONFIG.YUEN_UCHIAGE_MAX) | 0 : Infinity;
        const SORA_MAX = V16 ? has("sora2") ? 2 : 1 : null;
        const RETURN_SHUFFLE = !V16;
        const RETURN_EXILE = has("exile");
        const G6_COST = has("g6cost1") ? 1 : 0;
        const NIGHT_MAX = has("night3") ? 3 : V18 && has("night1") ? 1 : 2;
        const HANABI_DMG = V19 ? has("hanabi1") ? 1 : 2 : V18 ? has("hanabi2") ? 2 : 1 : 2;
        const HANABI_SINGLE = V18 && has("hanabiSingle");
        const UCHI2_COST = has("uchiage1") ? 1 : 3;
        const UCHI2_SPEED = 2;
        const HAND_TXT = 5;
        const UCHI_OLD = has("uchiOld");
        const UCHI_HP = 1;
        function addMaster(id, m) {
          if (M[id]) return false;
          M[id] = m;
          undo.push(() => {
            delete M[id];
          });
          did.push("★新規カード " + id + " " + m.name);
          return true;
        }
        addMaster(UCHIAGE, {
          id: UCHIAGE,
          name: "打ち上げ花火",
          faction: "YUEN",
          deck: "遊園地",
          pool: "base",
          type: "event",
          cost: 3,
          traits: ["遊園地"],
          attribute: null,
          attributeProvisional: false,
          effect: "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手の怪異1枚を選び、相手のデッキの下に置く",
          baseCount: null,
          oncePerTurnName: true
        });
        addMaster(GATE, {
          id: GATE,
          name: "閉園ゲート",
          faction: "YUEN",
          deck: "遊園地",
          pool: "base",
          type: "event",
          cost: 3,
          traits: ["遊園地"],
          attribute: null,
          attributeProvisional: false,
          effect: "【1ターン1枚】次の相手のターン、相手は人間/怪異を合計1体しか場に出せない",
          baseCount: null,
          oncePerTurnName: true
        });
        addMaster(UCHI2, {
          id: UCHI2,
          name: "打ち上げ",
          faction: "YUEN",
          deck: "遊園地",
          pool: "base",
          type: "event",
          cost: UCHI2_COST,
          traits: ["遊園地"],
          attribute: null,
          attributeProvisional: false,
          effect: "【1ターン1枚】自分の特徴〔遊園地〕を持つ怪異すべては、次の襲撃時にスピードを+" + UCHI2_SPEED + "する",
          baseCount: null,
          oncePerTurnName: true
        });
        if (M[UCHI2].cost !== UCHI2_COST) {
          const old = M[UCHI2].cost;
          M[UCHI2].cost = UCHI2_COST;
          undo.push(() => {
            M[UCHI2].cost = old;
          });
          did.push("★打ち上げ C" + old + "→C" + UCHI2_COST);
        }
        addMaster(G6, {
          id: G6,
          name: "汎G6",
          faction: "COMMON",
          deck: "共通",
          pool: "generic",
          type: "goods",
          cost: G6_COST,
          traits: [],
          attribute: null,
          attributeProvisional: false,
          effect: "効果なし",
          baseCount: null,
          equipBonus: { speed: 1 },
          equipTarget: { type: "youkai", trait: null, name: null },
          generic: true
        });
        if (M[G6].cost !== G6_COST) {
          const old = M[G6].cost;
          M[G6].cost = G6_COST;
          undo.push(() => {
            M[G6].cost = old;
          });
        }
        if (G6_COST === 1) did.push("★削り: 汎G6 を1コストに");
        const pd = M[PARADE];
        if (!pd || pd.name !== "パレード") throw new Error("patch-yuen-v15: " + PARADE + " がパレードでない");
        {
          const o = "C" + pd.cost + " " + pd.speed + "/" + pd.hp;
          let ch = false;
          if (pd.cost !== P_COST) {
            const x = pd.cost;
            pd.cost = P_COST;
            undo.push(() => {
              pd.cost = x;
            });
            ch = true;
          }
          if (pd.speed !== P_SPEED2) {
            const x = pd.speed;
            pd.speed = P_SPEED2;
            undo.push(() => {
              pd.speed = x;
            });
            ch = true;
          }
          if (pd.hp !== P_HP) {
            const x = pd.hp;
            pd.hp = P_HP;
            undo.push(() => {
              pd.hp = x;
            });
            ch = true;
          }
          if (ch) did.push("パレード " + o + " → C" + P_COST + " " + P_SPEED2 + "/" + P_HP);
        }
        if (V16) {
          const so = M[SORA];
          const o = "C" + so.cost + " " + so.speed + "/" + so.hp;
          let ch = false;
          if (so.cost !== SORA_COST) {
            const x = so.cost;
            so.cost = SORA_COST;
            undo.push(() => {
              so.cost = x;
            });
            ch = true;
          }
          if (so.speed !== SORA_SPEED) {
            const x = so.speed;
            so.speed = SORA_SPEED;
            undo.push(() => {
              so.speed = x;
            });
            ch = true;
          }
          if (so.hp !== SORA_HP) {
            const x = so.hp;
            so.hp = SORA_HP;
            undo.push(() => {
              so.hp = x;
            });
            ch = true;
          }
          if (ch) did.push("ソラ " + o + " → C" + SORA_COST + " " + SORA_SPEED + "/" + SORA_HP);
        }
        const ns = M[NIGHT];
        if (!ns || ns.name !== "ナイトサファリ") throw new Error("patch-yuen-v15: " + NIGHT + " がナイトサファリでない（" + (ns && ns.name) + "）");
        if (ns.cost !== 3) {
          const old = ns.cost;
          ns.cost = 3;
          undo.push(() => {
            ns.cost = old;
          });
          did.push("ナイトサファリ C" + old + "→C3");
        }
        function setHook(id, kind, fn, note) {
          const d = E.definitions[id] || (E.definitions[id] = {});
          const old = Object.prototype.hasOwnProperty.call(d, kind) ? d[kind] : void 0;
          d[kind] = fn;
          undo.push(() => {
            if (old === void 0) delete d[kind];
            else d[kind] = old;
          });
          if (note) did.push(note);
        }
        setHook(PARADE, "cost", function(side, inst, m, st) {
          const n = Math.floor(st.players[side].trash.filter(yuenEvent).length / P_DIV);
          return n ? [{ delta: -n, floor: FLOOR, note: "パレード：-" + n + "（下限" + FLOOR + "）" }] : [{ floor: FLOOR }];
        }, "パレード：コスト下限 4→" + FLOOR + "／割引は" + P_DIV + "枚ごとに-1");
        setHook(PARADE, "enter", function(ctx, done) {
          const st = ctx.state;
          if (has("once")) {
            const key = "parade:" + ctx.side;
            st.__paradeUsed = st.__paradeUsed || {};
            if (st.__paradeUsed[key]) {
              ctx.log("不発：【ゲーム中に1回】使用済み");
              done();
              return;
            }
            st.__paradeUsed[key] = true;
          }
          const cands = ctx.me.trash.filter((c) => yuenEvent(c) && originalCost(c) >= PARADE_MIN);
          if (!cands.length) {
            ctx.log("不発：トラッシュに元コスト" + PARADE_MIN + "以上の〔遊園地〕イベントがない");
            done();
            return;
          }
          const cap = Math.min(cands.length, REPLAY_MAX);
          ctx.pickCards({ title: "パレード", message: "トラッシュから使う〔遊園地〕イベント（元コスト" + PARADE_MIN + "以上）を" + (REPLAY_MAX === Infinity ? "好きな枚数" : cap + "枚まで") + "選んでください", cards: cands, count: cap, mode: "max" }, (ch) => {
            const list2 = (ch || []).slice();
            if (!list2.length) {
              done();
              return;
            }
            const fire = (ordered) => {
              st.__paradeReturn = st.__paradeReturn || [];
              st.__paradeReturn.push({ side: ctx.side, cards: ordered.slice(), remaining: ordered.length });
              ordered.forEach((ev) => {
                Game._useEvent(ctx.side, ev, { from: "trash", cost: 0, after: "stay", ignoreOnce: true, fixedOrder: true });
              });
              done();
            };
            if (list2.length > 1) ctx.pickOrder({ title: "パレード", message: "解決する順番を選んでください", items: list2 }, (o) => fire(o && o.length === list2.length ? o : list2));
            else fire(list2);
          });
        }, "パレード：踏み倒し対象を元コスト" + PARADE_MIN + "以上に限定／撃ち直した札はデッキの下" + (RETURN_SHUFFLE ? "＋シャッフル" : RETURN_EXILE ? "→★除外" : "（★シャッフルしない）") + (REPLAY_MAX !== Infinity ? "／★削り: 撃ち直しは" + REPLAY_MAX + "枚まで" : "") + (has("once") ? "／★削り: 【ゲーム中に1回】" : ""));
        const oRun = Game.runEffect;
        Game.runEffect = function(item, uiOps, done) {
          const self = this;
          return oRun.call(this, item, uiOps, function() {
            if (item && item.kind === "event" && item.source) {
              const st = self.state, batches = st.__paradeReturn;
              if (batches && batches.length) {
                for (let i = 0; i < batches.length; i++) {
                  const b = batches[i];
                  if (b.cards.indexOf(item.source) === -1) continue;
                  b.remaining--;
                  if (b.remaining <= 0) {
                    const p = st.players[b.side];
                    const move = [];
                    b.cards.forEach((c) => {
                      const k = p.trash.indexOf(c);
                      if (k !== -1) {
                        p.trash.splice(k, 1);
                        move.push(c);
                      }
                    });
                    if (move.length) {
                      if (RETURN_SHUFFLE) {
                        move.forEach((c) => {
                          self._resetOffField(c);
                          p.deck.push(c);
                        });
                        self._shuffle("parade:" + b.side, p.deck);
                        st.log.push("パレード：使ったイベント" + move.length + "枚をデッキの下に戻してシャッフル（" + p.label + "）");
                      } else if (RETURN_EXILE) {
                        move.forEach((c) => {
                          self._resetOffField(c);
                          p.exile.push(c);
                        });
                        st.log.push("パレード：使ったイベント" + move.length + "枚を除外した（" + p.label + "）");
                      } else {
                        self.putOnBottom(b.side, move, "choose");
                        st.log.push("パレード：使ったイベント" + move.length + "枚をデッキの下に置いた（シャッフルなし・" + p.label + "）");
                      }
                    }
                    batches.splice(i, 1);
                  }
                  break;
                }
              }
            }
            if (done) done();
          });
        };
        undo.push(() => {
          Game.runEffect = oRun;
        });
        const soraOk = V16 ? (c) => yuenEvent(c) && originalCost(c) <= SORA_MAX : (c) => yuenEvent(c) && originalCost(c) >= 3;
        const soraLabel = V16 ? "元コスト" + SORA_MAX + "以下" : "元コスト3以上";
        setHook(SORA, "enter", function(ctx, done) {
          const cands = ctx.me.trash.filter(soraOk);
          if (!cands.length) {
            ctx.log("不発：トラッシュに" + soraLabel + "の〔遊園地〕イベントがない");
            done();
            return;
          }
          ctx.pickCards({ title: "ソラ", message: "トラッシュから使う〔遊園地〕イベント（" + soraLabel + "）を1枚選んでください", cards: cands, count: 1, mode: "exact" }, (ch) => {
            if (ch && ch.length) {
              Game._useEvent(ctx.side, ch[0], { from: "trash", cost: 0, after: "stay" });
            }
            done();
          });
        }, "ソラ：踏み倒し対象を" + soraLabel + "に限定");
        {
          const m = M[SORA], old = m.effect;
          const t = "【登場時】自分のトラッシュから特徴〔遊園地〕を持つ" + soraLabel + "のイベント1枚を選ぶ。そのカードをトラッシュに残したまま、コストを支払わずに使う";
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        setHook(PHOTO, "event", function(ctx, done) {
          const drawFirst = !has("photoOrder");
          const draw = () => {
            if (!ctx.isOver()) Game.drawOne(ctx.side);
          };
          const discard = (after) => {
            const hand = ctx.me.hand.slice();
            if (!hand.length) {
              ctx.log("手札がないため捨てません");
              after();
              return;
            }
            ctx.pickCards(
              { title: "写真館", message: "トラッシュに置く手札を1枚選んでください", cards: hand, count: 1, mode: "exact" },
              (ch) => {
                Game.discardFromHand(ctx.side, ch || [], "写真館");
                after();
              }
            );
          };
          if (drawFirst) {
            draw();
            discard(done);
          } else discard(() => {
            draw();
            done();
          });
        }, "写真館改：" + (has("photoOrder") ? "★削り: 捨ててから引く" : "1枚引いてから手札1枚を捨てる"));
        {
          const m = M[PHOTO], old = m.effect;
          const t = has("photoOrder") ? "【1ターン1枚】自分の手札1枚を捨てる。その後、自分は1枚ドローする。" : "【1ターン1枚】自分は1枚ドローする。その後、自分の手札1枚を捨てる。";
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        if (V18) {
          setHook(HANABI, "event", function(ctx, done) {
            if (!hasTrait(ctx.me.field, "遊園地")) {
              ctx.log("不発：フィールドが〔遊園地〕ではない");
              done();
              return;
            }
            if (HANABI_SINGLE) {
              const list3 = ctx.targetable(ctx.opponent.youkai.slice());
              if (!list3.length) {
                ctx.log("不発：対象の怪異がいない");
                done();
                return;
              }
              ctx.pickBoardTarget({ title: "花火", message: "1ダメージを与える怪異を1枚選んでください", candidates: list3, amount: HANABI_DMG }, (t2) => {
                if (t2) Game.dealEffectDamage(t2, HANABI_DMG, "花火", ctx.side);
                done();
              });
              return;
            }
            const list2 = ctx.opponent.youkai.slice();
            if (!list2.length) {
              ctx.log("不発：相手の怪異がいない");
              done();
              return;
            }
            list2.forEach((c) => Game.dealEffectDamage(c, HANABI_DMG, "花火", ctx.side));
            done();
          }, "★花火：" + (HANABI_SINGLE ? "★削り: 単体" + HANABI_DMG + "ダメージ" : "全体2→全体" + HANABI_DMG + "ダメージ"));
          const m = M[HANABI], old = m.effect;
          const t = HANABI_SINGLE ? "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手の怪異1枚に" + HANABI_DMG + "ダメージを与える" : "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手の怪異すべてに" + HANABI_DMG + "ダメージを与える";
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        setHook(NIGHT, "event", function(ctx, done) {
          const cands = ctx.me.trash.filter((c) => c.master.type === "youkai" && hasTrait(c, "遊園地") && originalCost(c) <= NIGHT_MAX);
          if (!cands.length || ctx.me.youkai.length >= MAX_YOUKAI) {
            ctx.log("不発");
            done();
            return;
          }
          ctx.pickCards(
            { title: "ナイトサファリ", message: "場に出す怪異を1枚選んでください", cards: cands, count: 1, mode: "exact" },
            (ch) => {
              if (ch && ch.length) Game.summonFromTrash(ctx.side, ch[0], 0, "ナイトサファリ");
              done();
            }
          );
        }, "ナイトサファリ：対象を元コスト5以下→" + NIGHT_MAX + "以下");
        {
          const m = M[NIGHT], old = m.effect;
          const t = "【1ターン1枚】自分のトラッシュから特徴〔遊園地〕を持つ元のコスト" + NIGHT_MAX + "以下の怪異1枚を、自分の場に出す";
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        function toDeckBottom(opp, t, why) {
          Game._leaveField(t, null, why);
          const p = Game.state.players[opp], k = p.trash.indexOf(t);
          if (k !== -1) {
            p.trash.splice(k, 1);
            Game.putOnBottom(opp, [t], "random");
          }
        }
        if (V18 && !UCHI_OLD) {
          setHook(UCHIAGE, "event", function(ctx, done) {
            if (!hasTrait(ctx.me.field, "遊園地")) {
              ctx.log("不発：フィールドが〔遊園地〕ではない");
              done();
              return;
            }
            const opp = otherSide(ctx.side);
            const list2 = ctx.opponent.youkai.filter((c) => {
              const st = Game.getStats(c);
              return st.hasStats && st.curHp <= UCHI_HP;
            });
            if (!list2.length) {
              ctx.log("不発：体力" + UCHI_HP + "以下の怪異がいません（打ち上げ花火）");
              done();
              return;
            }
            list2.forEach((t2) => toDeckBottom(opp, t2, "打ち上げ花火"));
            ctx.log("打ち上げ花火：" + list2.map(nameOf).join("・") + " を相手のデッキの下へ（" + list2.length + "体）");
            done();
          }, "★打ち上げ花火：体力" + UCHI_HP + "以下の怪異をすべて相手のデッキの下へ");
          const m = M[UCHIAGE], old = m.effect;
          const t = "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手の体力が" + UCHI_HP + "以下の怪異をすべて、相手のデッキの下に置く";
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        } else
          setHook(UCHIAGE, "event", function(ctx, done) {
            if (!hasTrait(ctx.me.field, "遊園地")) {
              ctx.log("不発：フィールドが〔遊園地〕ではない");
              done();
              return;
            }
            const opp = otherSide(ctx.side);
            const list2 = ctx.targetable(ctx.opponent.youkai.filter((c) => originalCost(c) <= UCHI_MAX));
            if (!list2.length) {
              ctx.log("不発：対象の怪異がいません（打ち上げ花火）");
              done();
              return;
            }
            ctx.pickBoardTarget({ title: "打ち上げ花火", message: "相手のデッキの下に置く怪異を1枚選んでください", candidates: list2 }, (t) => {
              if (!t) {
                done();
                return;
              }
              Game._leaveField(t, null, "打ち上げ花火");
              const p = Game.state.players[opp], k = p.trash.indexOf(t);
              if (k !== -1) {
                p.trash.splice(k, 1);
                Game.putOnBottom(opp, [t], "random");
              }
              ctx.log("打ち上げ花火：" + nameOf(t) + " を相手のデッキの下へ");
              done();
            });
          }, "★打ち上げ花火：新規実装（COMMON-004 の確定除去は死札だったので流用できず）");
        if (!(V18 && !UCHI_OLD)) {
          const m = M[UCHIAGE], old = m.effect;
          const t = "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手の" + (UCHI_MAX === Infinity ? "" : "元のコスト" + UCHI_MAX + "以下の") + "怪異1枚を選び、相手のデッキの下に置く";
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        setHook(GATE, "event", function(ctx, done) {
          Game.addTempEffect({
            kind: "playLimit",
            owner: ctx.side,
            banSide: otherSide(ctx.side),
            limit: 1,
            until: { type: "oppTurnEnd" },
            note: "閉園ゲート：次の相手のターン、合計1体まで"
          });
          ctx.log("閉園ゲート：次の相手のターン、相手は人間/怪異を合計1体しか場に出せない");
          done();
        }, "★閉園ゲート：新規実装（playLimit の持続効果を新設）");
        setHook(UCHI2, "event", function(ctx, done) {
          const n = ctx.me.youkai.filter((c) => hasTrait(c, "遊園地")).length;
          if (!n) {
            ctx.log("不発：〔遊園地〕を持つ自分の怪異がいない（打ち上げ）");
            done();
            return;
          }
          Game.addTempEffect({
            kind: "stat",
            owner: ctx.side,
            target: { owner: ctx.side, types: ["youkai"], trait: "遊園地" },
            speed: UCHI2_SPEED,
            hp: 0,
            until: { type: "ownAssault" },
            note: "打ち上げ：スピード+" + UCHI2_SPEED
          });
          ctx.log("打ち上げ：次の自分の襲撃時〔遊園地〕怪異" + n + "体のスピード+" + UCHI2_SPEED);
          done();
        }, "★打ち上げ（新規）：C" + UCHI2_COST + "／〔遊園地〕怪異すべてが次の襲撃時スピード+" + UCHI2_SPEED);
        {
          const m = M[UCHI2], old = m.effect;
          const t = "【1ターン1枚】自分の特徴〔遊園地〕を持つ怪異すべては、次の襲撃時にスピードを+" + UCHI2_SPEED + "する";
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        if (V19) {
          setHook(HANABI, "event", function(ctx, done) {
            if (!hasTrait(ctx.me.field, "遊園地")) {
              ctx.log("不発：フィールドが〔遊園地〕ではない");
              done();
              return;
            }
            const list2 = ctx.opponent.youkai.slice();
            if (!list2.length) {
              ctx.log("不発：相手の怪異がいない");
              done();
              return;
            }
            list2.forEach((c) => Game.dealEffectDamage(c, HANABI_DMG, "花火", ctx.side));
            done();
          }, "花火：全体" + HANABI_DMG + "ダメージ" + (has("hanabi1") ? "（★削り: 全体2→全体1）" : "（v1.4 と同じ）"));
          const m = M[HANABI], old = m.effect;
          const t = "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手の怪異すべてに" + HANABI_DMG + "ダメージを与える";
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        const YUEN_CUT = has("yuenCut0") ? 0 : has("yuenCut2") ? 2 : 1;
        if (YUEN_CUT !== 1) {
          setHook(FIELD, "cost", function(side, inst, m, st) {
            if (!YUEN_CUT) return [];
            return m.type === "event" && (m.traits || []).includes("遊園地") ? [{ delta: -YUEN_CUT, note: "～遊園地～：〔遊園地〕イベント-" + YUEN_CUT }] : [];
          }, "★フィールド ～遊園地～：〔遊園地〕イベントの軽減 -1 → -" + YUEN_CUT);
        }
        {
          const fm = M[FIELD], old = fm.effect;
          const draw = "自分の手札が" + HAND_TXT + "枚以下なら、自分が特徴〔遊園地〕を持つイベントを使った時、自分は1枚ドローする。";
          const t = (YUEN_CUT ? "自分の特徴〔遊園地〕を持つイベントのコストを-" + YUEN_CUT + "する。／" : "") + draw;
          if (old !== t) {
            fm.effect = t;
            undo.push(() => {
              fm.effect = old;
            });
          }
        }
        const oRestrict = E.playRestriction;
        E.playRestriction = function(side, inst, master, state) {
          const r = oRestrict.call(this, side, inst, master, state);
          if (r) return r;
          if (master && (master.type === "human" || master.type === "youkai")) {
            const lim = state.tempEffects.filter((e) => e.kind === "playLimit" && e.banSide === side);
            if (lim.length) {
              const cap = Math.min.apply(null, lim.map((e) => e.limit));
              const p = state.players[side];
              const placed = p.humans.concat(p.youkai).filter((c) => c.enteredTurn === state.turnCount).length;
              if (placed >= cap) return "閉園ゲート：このターンは合計" + cap + "体までしか場に出せない";
            }
          }
          return null;
        };
        undo.push(() => {
          E.playRestriction = oRestrict;
        });
        {
          const m = M[PARADE], old = m.effect;
          const t = "自分のトラッシュに特徴〔遊園地〕を持つイベントが" + P_DIV + "枚あるごとに、このカードのコストを-1する。ただし、コストは" + FLOOR + "未満にならない／【登場時】" + (has("once") ? "【ゲーム中に1回】" : "") + "自分のトラッシュから特徴〔遊園地〕を持つ元のコスト" + PARADE_MIN + "以上のイベントを好きな枚数選び、それらを好きな順番で、コストを支払わずに使う。" + (RETURN_SHUFFLE ? "こうして使ったイベントは、すべて持ち主のデッキの下に置き、デッキをシャッフルする" : RETURN_EXILE ? "こうして使ったイベントは、すべて除外する" : "こうして使ったイベントは、すべて持ち主のデッキの下に置く（シャッフルしない）");
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        const deck = D["gd1-yuen"];
        if (!deck) throw new Error("patch-yuen-v15: gd1-yuen が無い");
        let list;
        if (CONFIG.YUEN_DECK) {
          list = function() {
            throw new Error("v1.0: YUEN_DECK は使えない");
          }();
          if (!Array.isArray(list)) list = list.mainDeck;
          did.push("★デッキリストを " + CONFIG.YUEN_DECK + " から読み込み");
        } else if (V19) {
          list = V19_DECK.map((e) => ({ id: e.id, count: e.count }));
          did.push("★v1.9 のリスト（13行40枚・人間13/怪異9/イベント18：打ち上げ花火を削除、★打ち上げ×2 を追加、花火は全体2のまま4枚）");
        } else if (V18) {
          list = V18_DECK.map((e) => ({ id: e.id, count: e.count }));
          did.push("★v1.8 のリスト（13行40枚・人間13/怪異9/イベント18：園怪2 3→2、花火 3→4）");
        } else if (V16) {
          list = V16_DECK.map((e) => ({ id: e.id, count: e.count }));
          did.push("★" + (V17 ? "v1.7" : "v1.6") + " のリスト（13行40枚・人間13/怪異10/イベント17・汎G6なし）" + (V17 ? "＝v1.6 から変更なし" : ""));
        } else {
          list = V15_DECK_PROVISIONAL.map((e) => ({ id: e.id, count: e.count }));
          did.push("★v1.5 暫定リスト（イベント17維持・人間怪異から4枚削減）");
        }
        if (has("g6in")) {
          list = list.map((e) => e.id === "YUEN-006" || e.id === "YUEN-007" ? { id: e.id, count: e.count - 1 } : e);
          list.push({ id: G6, count: 2 });
          did.push("★強化: 汎G6 を2枚（園怪1・園怪2 を各1枚減）");
        }
        if (has("noGate")) {
          list = list.filter((e) => e.id !== GATE).map((e) => e.id === "YUEN-006" || e.id === "YUEN-007" ? { id: e.id, count: e.count + 1 } : e);
          did.push("★削り: 閉園ゲート×2 を抜き、園怪1・園怪2 を各+1");
        }
        if (has("uchiage3")) {
          list = list.map((e) => e.id === UCHI2 ? { id: e.id, count: e.count + 1 } : e.id === "YUEN-006" ? { id: e.id, count: e.count - 1 } : e);
          did.push("★強化: 打ち上げ 2→3枚（園怪1 3→2）");
        }
        if (has("noUchiage")) {
          list = list.filter((e) => e.id !== UCHI2).map((e) => e.id === "YUEN-007" ? { id: e.id, count: e.count + 2 } : e);
          did.push("★分解: 打ち上げ×2 を抜き、園怪2 を +2");
        }
        if (has("kaii3")) {
          list = list.map((e) => e.id === VIEW ? { id: e.id, count: Math.max(0, e.count - 2) } : e);
          list.push({ id: KAII3, count: 2 });
          did.push("★強化: 園怪3 を2枚戻す（見晴らし 4→2）");
        }
        const total = list.reduce((a, e) => a + e.count, 0);
        if (total !== 40) throw new Error("patch-yuen-v15: 合計が " + total + "枚（40でない）");
        const over = list.filter((e) => e.count > 4);
        if (over.length) throw new Error("patch-yuen-v15: 同名4枚超 " + over.map((e) => e.id + "×" + e.count).join(","));
        list.forEach((e) => {
          if (!M[e.id]) throw new Error("patch-yuen-v15: 未登録のカード " + e.id);
        });
        const oldMain = deck.mainDeck, oldLabel = deck.label;
        deck.mainDeck = list;
        deck.label = V19 ? "遊園地 v1.9" : V18 ? "遊園地 v1.8" : V17 ? "遊園地 v1.7" : V16 ? "遊園地 v1.6" : "遊園地 v1.5";
        undo.push(() => {
          deck.mainDeck = oldMain;
          deck.label = oldLabel;
        });
        if (oldLabel !== deck.label) did.push("デッキ差し替え（20種 → " + list.length + "行40枚）");
        return {
          applied: did,
          floor: FLOOR,
          paradeSpeed: P_SPEED,
          g6Cost: G6_COST,
          nightMax: NIGHT_MAX,
          hanabiDmg: HANABI_DMG,
          uchi2Cost: UCHI2_COST,
          uchi2Speed: UCHI2_SPEED,
          v19: V19,
          deck: list,
          restore() {
            undo.slice().reverse().forEach((f) => f());
          }
        };
      }
      module.exports = { patchYuenV15, V15_DECK_PROVISIONAL, V19_DECK, UCHI2 };
    }
  });

  // src/rules/L06-chika-v15.js
  var require_L06_chika_v15 = __commonJS({
    "src/rules/L06-chika-v15.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var SR = "CHIKA-010";
      var CM = "CHIKA-011";
      var SHIZU = "CHIKA-003";
      var SHIZU_B = "CHIKA-004";
      var JIN8 = "CHIKA-024";
      var G2 = "CHIKA-012";
      var CHIKA_I = "CHIKA-013";
      var TORCH = "MURA-010";
      var LINE = "MURA-012";
      var G3 = "COMMON-003";
      var KAGE2 = "CHIKA-008";
      var JIN2 = "CHIKA-005";
      var V15_DECK = [
        { id: "CHIKA-001", count: 1 },
        // 初期        人間 0  2/3
        { id: "CHIKA-002", count: 4 },
        // 地人1       人間 1  2/3
        { id: SHIZU, count: 4 },
        // シズ（表）    人間 1  2/2
        { id: "CHIKA-005", count: 3 },
        // 地人2       人間 2  3/4
        { id: "CHIKA-006", count: 4 },
        // 挑発        人間 2  1/5
        { id: "CHIKA-007", count: 4 },
        // 影1         怪異 1  3/2
        { id: "CHIKA-008", count: 4 },
        // 影2         怪異 1  2/2
        { id: "CHIKA-009", count: 4 },
        // 影3         怪異 2  3/4
        { id: SR, count: 4 },
        // SR巨人      怪異 5  4/8  ★3/9→4/8, 3→4枚
        { id: CM, count: 2 },
        // コモン巨人   怪異 5  4/8  ★2/10→4/8
        { id: TORCH, count: 2 },
        // 懐中電灯     グッズ 0（体力+1）
        { id: LINE, count: 4 }
        // 境界線       イベント 0
      ];
      function patchChikaV15(env) {
        const NERF = String(CONFIG.CHIKA_NERF || "").split(",").map((s) => s.trim()).filter(Boolean);
        const has = (f) => NERF.indexOf(f) !== -1;
        const V17B = String(CONFIG.CHIKA_V17B || "") === "1";
        const V17 = V17B || String(CONFIG.CHIKA_V17 || "") === "1";
        const V16 = V17 || String(CONFIG.CHIKA_V16 || "") === "1";
        const M = env.CARD_MASTER, D = env.DECKS, E = env.Effects;
        const { hasTrait } = env.helpers;
        const Game = env.Game;
        const undo = [], did = [];
        const SR_SPEED = V16 ? has("sr48") ? 4 : has("sr5") ? 5 : 5 : has("sr5") ? 5 : has("sr39") ? 3 : 4;
        const SR_HP = V16 ? has("sr48") ? 8 : 4 : has("sr39") ? 9 : 8;
        const CM_SPEED = V17 ? has("cm36") ? 3 : 4 : V16 ? has("cm48") ? 4 : 3 : has("sr5") ? 5 : has("common210") ? 2 : 4;
        const CM_HP = V17 ? has("cm48") ? 8 : has("cm36") ? 6 : 5 : V16 ? has("cm48") ? 8 : 6 : has("common210") ? 10 : 8;
        const SR_DMG = V16 ? has("sr3dmg") ? 3 : 2 : 3;
        const CM_TEMP = V16 && !has("cmLock");
        const KAGE2_MILL = V16 && !has("kage2old");
        const JIN2_SEARCH = V16 && !has("jin2old");
        const SHIZU_B_HP = V17 ? has("shizu25") ? 5 : has("shizu24") ? 4 : 3 : has("shizu23") ? 3 : 5;
        const SHIZU_B_NOSEARCH = V17 ? !has("shizuSearch") : has("shizuNoSearch");
        function setStats(id, name, speed, hp, baseCount) {
          const m = M[id];
          if (!m) throw new Error("patch-chika-v15: " + id + " が無い");
          if (m.name !== name) throw new Error("patch-chika-v15: " + id + " が " + name + " でない（" + m.name + "）");
          const o = m.speed + "/" + m.hp;
          let ch = false;
          if (m.speed !== speed) {
            const x = m.speed;
            m.speed = speed;
            undo.push(() => {
              m.speed = x;
            });
            ch = true;
          }
          if (m.hp !== hp) {
            const x = m.hp;
            m.hp = hp;
            undo.push(() => {
              m.hp = x;
            });
            ch = true;
          }
          if (baseCount != null && m.baseCount !== baseCount) {
            const x = m.baseCount;
            m.baseCount = baseCount;
            undo.push(() => {
              m.baseCount = x;
            });
          }
          if (ch) did.push(name + " " + o + " → " + speed + "/" + hp);
        }
        setStats(SR, "SR巨人", SR_SPEED, SR_HP, 4);
        setStats(CM, "コモン巨人", CM_SPEED, CM_HP, 2);
        setStats(JIN2, "地人2", V16 && JIN2_SEARCH ? 2 : 3, 4, null);
        setStats(SHIZU_B, "シズ（裏）", 2, SHIZU_B_HP, null);
        function setHook(id, kind, fn, note) {
          const d = E.definitions[id] || (E.definitions[id] = {});
          const old = Object.prototype.hasOwnProperty.call(d, kind) ? d[kind] : void 0;
          d[kind] = fn;
          undo.push(() => {
            if (old === void 0) delete d[kind];
            else d[kind] = old;
          });
          if (note) did.push(note);
        }
        function setText(id, t) {
          const m = M[id], old = m.effect;
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        function delHook(id, kind, note) {
          const d = E.definitions[id];
          if (!d || !Object.prototype.hasOwnProperty.call(d, kind)) return;
          const old = d[kind];
          delete d[kind];
          undo.push(() => {
            d[kind] = old;
          });
          if (note) did.push(note);
        }
        const nameOf = (c) => c.master.name;
        if (SHIZU_B_NOSEARCH) {
          delHook(SHIZU_B, "enter", "★シズ（裏）：【登場時】の〔巨人〕サーチを削除");
          setText(SHIZU_B, "〔地下〕〔巨人〕〔駅員〕｜効果なし");
        } else {
          setText(SHIZU_B, "〔地下〕〔巨人〕〔駅員〕｜【登場時】自分のデッキの上から5枚を見る。その中から特徴〔巨人〕を持つ怪異1枚を手札に加えることができる。残りをデッキの下に戻す");
        }
        if (SHIZU_B_HP !== 5) did.push("シズ（裏）2/5 → 2/" + SHIZU_B_HP);
        if (V16) {
          setHook(SR, "enter", function(ctx, done) {
            const list2 = ctx.opponent.youkai.slice();
            if (!list2.length) ctx.log("不発：相手の怪異がいない");
            list2.forEach((c) => Game.dealEffectDamage(c, SR_DMG, "SR巨人", ctx.side));
            done();
          }, "SR巨人：【登場時】全体3→" + SR_DMG + "ダメージ");
          setText(SR, "〔地下〕〔巨人〕｜【登場時】相手の怪異すべてに" + SR_DMG + "ダメージを与える");
          setHook(CM, "pursuitRestriction", function(side, yk, humans, st) {
            const def = st.players[side === "village" ? "mansion" : "village"];
            if (!def.youkai.some((c) => nameOf(c) === "コモン巨人")) return null;
            if (env.helpers.originalCost(yk) > 2) return null;
            if (CM_TEMP && yk.enteredTurn !== st.turnCount) return null;
            return "コモン巨人：元のコスト2以下の怪異は" + (CM_TEMP ? "、場に出たターンは" : "") + "追跡できない";
          }, "コモン巨人：" + (CM_TEMP ? "★ロックを「場に出たターン」限定に" : "ロックは恒久のまま"));
          setText(CM, "〔地下〕〔巨人〕｜相手の元のコスト2以下の怪異は" + (CM_TEMP ? "、場に出たターンに追跡できない" : "追跡できない"));
          if (KAGE2_MILL) {
            setHook(KAGE2, "leave", function(ctx, done) {
              Game.trashTopOfDeck(ctx.side, 2);
              done();
            }, "★影2：【離れた時】山上1枚サーチ → 山上2枚をトラッシュへ");
            setText(KAGE2, "〔地下〕｜【離れた時】自分のデッキの上から2枚をトラッシュに置く");
          } else {
            setText(KAGE2, "【離れた時】自分のデッキの上から1枚を見る。それが特徴〔巨人〕を持つ怪異なら、手札に加えることができる。手札に加えなかったなら、デッキの下に置く");
          }
          if (JIN2_SEARCH) {
            setHook(JIN2, "enter", function(ctx, done) {
              const looked = Game.lookTopOfDeck(ctx.side, 3);
              ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
              const finish = (taken) => {
                Game.resolveLook(ctx.side, looked, taken, false, "choose");
                ctx.showCards(taken, done);
              };
              if (!looked.length) {
                done();
                return;
              }
              const cands = looked.filter((c) => (c.master.type === "human" || c.master.type === "youkai") && hasTrait(c, "地下"));
              if (!cands.length) {
                finish([]);
                return;
              }
              ctx.pickCards(
                { title: "地人2", message: "手札に加えるカードを選んでください", cards: looked, selectable: cands, count: 1, mode: "max" },
                (ch) => finish(ch || [])
              );
            }, "★地人2：3/4バニラ → 2/4＋【登場時】山上3枚から〔地下〕人間/怪異1枚を手札へ");
            setText(JIN2, "〔地下〕｜【登場時】自分のデッキの上から3枚を見る。その中から特徴〔地下〕を持つ人間/怪異1枚を手札に加えることができる。残りをデッキの下に戻す");
          } else {
            setText(JIN2, "効果なし");
          }
        }
        const FIELD_CUT = has("fieldOff") ? 0 : has("field1") ? 1 : 2;
        const FIELD_GIANT_ONLY = V17B ? !has("fieldAll") : has("fieldGiant");
        if (FIELD_CUT !== 2 || FIELD_GIANT_ONLY) {
          setHook("FIELD-CHIKA", "cost", function(side, inst, m, st) {
            if (!FIELD_CUT) return [];
            const p = st.players[side];
            if (!p.youkai.some((c) => hasTrait(c, "巨人"))) return [];
            if (!(m.traits || []).includes("地下") || p.turnUse.chika !== 0) return [];
            if (FIELD_GIANT_ONLY && !(m.traits || []).includes("巨人")) return [];
            return [{
              delta: -FIELD_CUT,
              floor: 1,
              note: "～地下～：このターン初めての〔地下〕" + (FIELD_GIANT_ONLY ? "〔巨人〕" : "") + " -" + FIELD_CUT + "（下限1）"
            }];
          }, "★フィールド ～地下～：軽減 -2 → -" + FIELD_CUT + (FIELD_GIANT_ONLY ? "／対象を〔巨人〕を持つカードだけに限定" : ""));
          setText("FIELD-CHIKA", FIELD_CUT === 0 ? "効果なし" : "自分の場に特徴〔巨人〕を持つ怪異があるなら、自分がこのターン初めて使う特徴〔地下〕" + (FIELD_GIANT_ONLY ? "と特徴〔巨人〕の両方" : "") + "を持つカードのコストを-" + FIELD_CUT + "する。ただし、コストは1未満にならない。");
        } else {
          setText("FIELD-CHIKA", "自分の場に特徴〔巨人〕を持つ怪異があるなら、自分がこのターン初めて使う特徴〔地下〕を持つカードのコストを-2する。ただし、コストは1未満にならない。");
        }
        const deck = D["gd1-chika"];
        if (!deck) throw new Error("patch-chika-v15: gd1-chika が無い");
        let list = V15_DECK.map((e) => ({ id: e.id, count: e.count }));
        const bump = (id, d) => {
          list = list.map((e) => e.id === id ? { id: e.id, count: e.count + d } : e);
        };
        const drop = (id) => {
          list = list.filter((e) => e.id !== id);
        };
        if (has("g3")) {
          drop(TORCH);
          list.push({ id: G3, count: 2 });
          did.push("★戻し: グッズを懐中電灯 → 汎G3");
        }
        if (has("chikaG2")) {
          drop(TORCH);
          list.push({ id: G2, count: 2 });
          did.push("★戻し: グッズを懐中電灯 → 地グ2");
        }
        if (has("sr3")) {
          bump(SR, -1);
          bump("CHIKA-005", 1);
          did.push("★削り: SR巨人 4→3枚（地人2 +1）");
        }
        if (has("jin8")) {
          bump("CHIKA-002", -1);
          bump("CHIKA-006", -1);
          list.push({ id: JIN8, count: 2 });
          did.push("★戻し: 地人8 を2枚（地人1・挑発 各-1）");
        }
        if (has("chikaI")) {
          bump(LINE, -2);
          list.push({ id: CHIKA_I, count: 2 });
          did.push("★戻し: 地イ を2枚（境界線 4→2）");
        }
        list = list.filter((e) => e.count > 0);
        const total = list.reduce((a, e) => a + e.count, 0);
        if (total !== 40) throw new Error("patch-chika-v15: 合計が " + total + "枚（40でない）");
        const over = list.filter((e) => e.count > 4);
        if (over.length) throw new Error("patch-chika-v15: 同名4枚超 " + over.map((e) => e.id + "×" + e.count).join(","));
        list.forEach((e) => {
          if (!M[e.id]) throw new Error("patch-chika-v15: 未登録のカード " + e.id);
        });
        const by = {};
        list.forEach((e) => {
          const t = M[e.id].type;
          by[t] = (by[t] || 0) + e.count;
        });
        const oldMain = deck.mainDeck, oldLabel = deck.label;
        deck.mainDeck = list;
        deck.label = V17B ? "地下 v1.7b" : V17 ? "地下 v1.7" : V16 ? "地下 v1.6" : "地下 v1.5";
        undo.push(() => {
          deck.mainDeck = oldMain;
          deck.label = oldLabel;
        });
        did.push("デッキ差し替え（" + oldMain.length + "種 → " + list.length + "行40枚：人間" + (by.human || 0) + "・怪異" + (by.youkai || 0) + "・グッズ" + (by.goods || 0) + "・イベント" + (by.event || 0) + "）");
        return {
          applied: did,
          deck: list,
          breakdown: by,
          v16: V16,
          v17: V17,
          v17b: V17B,
          shizuBHp: SHIZU_B_HP,
          shizuBNoSearch: SHIZU_B_NOSEARCH,
          fieldCut: FIELD_CUT,
          fieldGiantOnly: FIELD_GIANT_ONLY,
          srSpeed: SR_SPEED,
          srHp: SR_HP,
          cmSpeed: CM_SPEED,
          cmHp: CM_HP,
          srDmg: SR_DMG,
          restore() {
            undo.slice().reverse().forEach((f) => f());
          }
        };
      }
      module.exports = { patchChikaV15, V15_DECK, SR, CM, SHIZU, SHIZU_B, TORCH, LINE, KAGE2, JIN2 };
    }
  });

  // src/rules/L07a-pool-a-core.js
  var require_L07a_pool_a_core = __commonJS({
    "src/rules/L07a-pool-a-core.js"(exports, module) {
      "use strict";
      function makeKit(env) {
        const M = env.CARD_MASTER, DECKS = env.DECKS, E = env.Effects, Game = env.Game;
        const { hasTrait, countTrait, originalCost, otherSide } = env.helpers;
        const MAX_YOUKAI = env.constants.MAX_YOUKAI, MAX_HUMANS = env.constants.MAX_HUMANS;
        const HAND_LIMIT = env.constants.HAND_LIMIT;
        const GAME_EVENT = env.GAME_EVENT || {};
        const undo = [], did = [];
        const nameOf = (c) => c.master.name;
        const hasKw = (inst, kw) => String(inst.master.effect || "").indexOf(kw) !== -1;
        const def = (id) => E.definitions[id];
        const units = (p) => p.humans.concat(p.youkai);
        const isUnit = (c) => c.master.type === "human" || c.master.type === "youkai";
        function setHook(id, kind, fn, note) {
          const d = E.definitions[id] || (E.definitions[id] = {});
          const old = Object.prototype.hasOwnProperty.call(d, kind) ? d[kind] : void 0;
          d[kind] = fn;
          undo.push(() => {
            if (old === void 0) delete d[kind];
            else d[kind] = old;
          });
          if (note) did.push(note);
        }
        function dropHook(id, kind) {
          const d = E.definitions[id];
          if (!d || !Object.prototype.hasOwnProperty.call(d, kind)) return;
          const old = d[kind];
          delete d[kind];
          undo.push(() => {
            d[kind] = old;
          });
        }
        function defineCard(id, obj, note) {
          const old = E.definitions[id];
          E.definitions[id] = obj;
          undo.push(() => {
            if (old === void 0) delete E.definitions[id];
            else E.definitions[id] = old;
          });
          if (note) did.push(note);
        }
        function setText(id, t) {
          const m = M[id];
          if (!m) throw new Error("pool-a: " + id + " が無い（setText）");
          const old = m.effect;
          if (old !== t) {
            m.effect = t;
            undo.push(() => {
              m.effect = old;
            });
          }
        }
        function setStats(id, cost, speed, hp) {
          const m = M[id];
          if (!m) throw new Error("pool-a: " + id + " が無い（setStats）");
          const o = "C" + m.cost + (m.speed != null ? " " + m.speed + "/" + m.hp : "");
          let ch = false;
          if (cost != null && m.cost !== cost) {
            const x = m.cost;
            m.cost = cost;
            undo.push(() => {
              m.cost = x;
            });
            ch = true;
          }
          if (speed != null && m.speed !== speed) {
            const x = m.speed;
            m.speed = speed;
            undo.push(() => {
              m.speed = x;
            });
            ch = true;
          }
          if (hp != null && m.hp !== hp) {
            const x = m.hp;
            m.hp = hp;
            undo.push(() => {
              m.hp = x;
            });
            ch = true;
          }
          if (ch) did.push(m.name + " " + o + " → C" + m.cost + (m.speed != null ? " " + m.speed + "/" + m.hp : ""));
        }
        function setPool(id, pool) {
          const m = M[id];
          if (!m || m.pool === pool) return;
          const x = m.pool;
          m.pool = pool;
          undo.push(() => {
            m.pool = x;
          });
          did.push(m.name + " pool " + x + "→" + pool);
        }
        function setDeckName(id, deck, faction) {
          const m = M[id];
          if (!m) return;
          if (m.deck !== deck) {
            const x = m.deck;
            m.deck = deck;
            undo.push(() => {
              m.deck = x;
            });
            did.push(m.name + " 所属 " + x + "→" + deck);
          }
          if (faction && m.faction !== faction) {
            const x = m.faction;
            m.faction = faction;
            undo.push(() => {
              m.faction = x;
            });
          }
        }
        function setEquip(id, target, bonus) {
          const m = M[id];
          if (!m) throw new Error("pool-a: " + id + " が無い（setEquip）");
          if (target) {
            const x = m.equipTarget;
            m.equipTarget = target;
            undo.push(() => {
              m.equipTarget = x;
            });
          }
          if (bonus) {
            const x = m.equipBonus;
            m.equipBonus = bonus;
            undo.push(() => {
              m.equipBonus = x;
            });
          }
        }
        function addMaster(id, m) {
          if (M[id]) return false;
          M[id] = m;
          undo.push(() => {
            delete M[id];
          });
          did.push("★新規カード " + id + " " + m.name);
          return true;
        }
        function pickOppTarget(ctx, cands, title, message, done, cb) {
          const list = ctx.targetable(cands);
          if (!list.length) {
            ctx.log("不発：対象がいません（" + title + "）");
            done();
            return;
          }
          ctx.pickBoardTarget({ title, message, candidates: list }, (t) => {
            if (!t) {
              done();
              return;
            }
            cb(t);
          });
        }
        function pickOwnTarget(ctx, cands, title, message, done, cb) {
          if (!cands.length) {
            ctx.log("不発：対象がいません（" + title + "）");
            done();
            return;
          }
          ctx.pickBoardTarget({ title, message, candidates: cands.slice() }, (t) => {
            if (!t) {
              done();
              return;
            }
            cb(t);
          });
        }
        function lookTake(ctx, n, filterFn, opts, done) {
          const o = Object.assign({ count: 1, reveal: false, bottom: "choose", exact: false, title: null }, opts || {});
          const looked = Game.lookTopOfDeck(ctx.side, n);
          ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
          if (!looked.length) {
            done();
            return;
          }
          const cands = looked.filter(filterFn);
          const finish = (taken) => {
            Game.resolveLook(ctx.side, looked, taken, o.reveal, o.bottom);
            ctx.showCards(taken, done);
          };
          if (!cands.length) {
            finish([]);
            return;
          }
          ctx.pickCards(
            { title: o.title || nameOf(ctx.source), message: "手札に加えるカードを選んでください", cards: looked, selectable: cands, count: o.count, mode: o.exact ? "exact" : "max" },
            (chosen) => finish(chosen || [])
          );
        }
        function takeFromTrash(ctx, filterFn, title, done) {
          const cands = ctx.me.trash.filter(filterFn);
          if (!cands.length) {
            ctx.log("不発：回収できるカードがありません（" + title + "）");
            done();
            return;
          }
          ctx.pickCards({ title, message: "手札へ加えるカードを選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (chosen) => {
            if (chosen && chosen.length) {
              Game.moveTrashToHand(ctx.side, chosen[0]);
              ctx.showCards(chosen, done);
              return;
            }
            ctx.log(title + "：0枚を選択");
            done();
          });
        }
        function summonOneFromTrash(ctx, filterFn, title, done) {
          const cands = ctx.me.trash.filter(filterFn);
          if (!cands.length || ctx.me.youkai.length >= MAX_YOUKAI) {
            ctx.log("不発：" + title);
            done();
            return;
          }
          ctx.pickCards(
            { title, message: "トラッシュから場に出す怪異を選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" },
            (ch) => {
              if (ch && ch.length) Game.summonFromTrash(ctx.side, ch[0], 0, title);
              done();
            }
          );
        }
        function drawN(ctx, n) {
          let k = 0;
          for (let i = 0; i < n; i++) {
            if (ctx.isOver()) break;
            if (Game.drawOne(ctx.side)) k++;
          }
          return k;
        }
        function pump(ctx, target, speed, hp, until, note) {
          Game.addTempEffect({ kind: "stat", owner: ctx.side, target: { uid: target.uid }, speed, hp, until, note: note || nameOf(ctx.source) });
          ctx.log((note || nameOf(ctx.source)) + "：" + nameOf(target) + " スピード" + (speed >= 0 ? "+" : "") + speed + (hp ? " 体力" + (hp >= 0 ? "+" : "") + hp : ""));
        }
        function dmg(ctx, target, n, name) {
          let amount = n;
          if (ctx.source.master.type === "human") (ctx.source.equipment || []).forEach((g) => {
            if (hasKw(g, "効果によって与えるダメージを+1する")) amount += 1;
          });
          Game.dealEffectDamage(target, amount, name || nameOf(ctx.source), ctx.side);
        }
        const ownAssaultUntil = () => ({ type: "ownAssault" });
        const oppAssaultUntil = () => ({ type: "oppAssault" });
        const nextTurnStartUntil = () => ({ type: "myNextTurnStart" });
        const oppTurnEndUntil = () => ({ type: "oppTurnEnd" });
        const selfStat = (cond, note) => function(src, target, st) {
          if (target !== src) return null;
          const r = cond(src, st);
          if (!r) return null;
          return { speed: r.speed || 0, hp: r.hp || 0, note: note + "：" + (r.speed ? "スピード+" + r.speed : "") + (r.speed && r.hp ? "・" : "") + (r.hp ? "体力+" + r.hp : "") };
        };
        function discardOwnChoice(ctx, n, done, cause) {
          const hand = ctx.me.hand.slice();
          if (!hand.length) {
            ctx.log("手札がないため捨てません");
            done([]);
            return;
          }
          const k = Math.min(n, hand.length);
          ctx.pickCards(
            { title: nameOf(ctx.source), message: "トラッシュへ置く手札を" + k + "枚選んでください", cards: hand, count: k, mode: "exact", ordered: true },
            (chosen) => {
              done(Game.discardFromHand(ctx.side, chosen, cause));
            }
          );
        }
        function opponentDiscards(ctx, n, done, cause) {
          const opp = otherSide(ctx.side);
          const hand = ctx.opponent.hand.slice();
          if (!hand.length) {
            ctx.log("相手の手札がないため捨てません");
            done([]);
            return;
          }
          const k = Math.min(n, hand.length);
          const ops = ctx.oppOps();
          ops.pickCards(
            { title: nameOf(ctx.source) + "（相手の効果）", message: "トラッシュへ置く手札を" + k + "枚選んでください", cards: hand, count: k, mode: "exact" },
            (chosen) => {
              done(Game.discardFromHand(opp, chosen, cause || nameOf(ctx.source)));
            }
          );
        }
        function lookerDiscards(ctx, n, done) {
          const opp = otherSide(ctx.side);
          const hand = ctx.opponent.hand.slice();
          Game.recordHandLook(ctx.side, hand);
          ctx.log("手札を見た：" + ctx.me.label + " → " + ctx.opponent.label + "の手札" + hand.length + "枚（見た側だけが知る）");
          if (!hand.length) {
            done([]);
            return;
          }
          const k = Math.min(n, hand.length);
          ctx.pickCards(
            { title: nameOf(ctx.source), message: "相手の手札から捨てるカードを" + k + "枚選んでください", cards: hand, count: k, mode: "exact", privateView: true },
            (chosen) => {
              done(Game.discardFromHand(opp, chosen, nameOf(ctx.source)));
            }
          );
        }
        function useEventFromTrash(ctx, ev, after, ignoreOnce, done) {
          Game._useEvent(ctx.side, ev, { from: "trash", cost: 0, after, ignoreOnce });
          done();
        }
        function onceTurn(ctx, name) {
          const k = Game.turnUseKey(ctx.side, name);
          if (Game.isEffectUsed(k)) return false;
          Game.markEffectUsed(k);
          return true;
        }
        function onceGame(ctx, name) {
          const k = Game.gameUseKey(ctx.side, name);
          if (Game.isEffectUsed(k)) return false;
          Game.markEffectUsed(k);
          return true;
        }
        const oCostMods = E.costModifiers;
        E.costModifiers = function(side, inst, m, state) {
          const mods = (oCostMods.apply(this, arguments) || []).slice();
          const O = state.players[otherSide(side)];
          units(O).forEach((u) => {
            const d = def(u.cardId);
            if (d && d.oppCost) {
              const r = d.oppCost(side, inst, m, state, u);
              if (r && r.length) r.forEach((x) => mods.push(x));
            }
          });
          return mods;
        };
        undo.push(() => {
          E.costModifiers = oCostMods;
        });
        const oPlayRestrict = E.playRestriction;
        E.playRestriction = function(side, inst, m, state) {
          const r = oPlayRestrict.apply(this, arguments);
          if (r) return r;
          for (const e of state.tempEffects) {
            if (e.kind !== "playBan" || e.banSide !== side) continue;
            if (e.banTypes && e.banTypes.indexOf(m.type) === -1) continue;
            return e.note || "このカードは使えません";
          }
          const O = state.players[otherSide(side)];
          for (const u of units(O)) {
            const d = def(u.cardId);
            if (d && d.oppPlayRestriction) {
              const x = d.oppPlayRestriction(side, inst, m, state, u);
              if (x) return x;
            }
          }
          return null;
        };
        undo.push(() => {
          E.playRestriction = oPlayRestrict;
        });
        function nonHandSummonBan(side, st) {
          const O = st.players[otherSide(side)];
          for (const u of units(O)) {
            const d = def(u.cardId);
            if (d && d.banOppNonHandSummon && d.banOppNonHandSummon(u, st)) return nameOf(u);
          }
          return null;
        }
        const oSFT = Game.summonFromTrash, oSFL = Game.summonFromLost;
        Game.summonFromTrash = function(side) {
          const by = nonHandSummonBan(side, this.state);
          if (by) {
            this.state.log.push("不発：手札以外から場に出せない（" + by + "）");
            return null;
          }
          return oSFT.apply(this, arguments);
        };
        Game.summonFromLost = function(side) {
          const by = nonHandSummonBan(side, this.state);
          if (by) {
            this.state.log.push("不発：手札以外から場に出せない（" + by + "）");
            return null;
          }
          return oSFL.apply(this, arguments);
        };
        undo.push(() => {
          Game.summonFromTrash = oSFT;
          Game.summonFromLost = oSFL;
        });
        function handLimitFor(side, st) {
          let lim = HAND_LIMIT;
          const O = st.players[otherSide(side)];
          units(O).forEach((u) => {
            const d = def(u.cardId);
            if (!d || d.oppHandLimit == null) return;
            const v = typeof d.oppHandLimit === "function" ? d.oppHandLimit(u, st) : d.oppHandLimit;
            if (v != null) lim = Math.min(lim, v);
          });
          return lim;
        }
        const oAddToHand = Game._addToHand, oIsHandFull = Game.isHandFull;
        Game._addToHand = function(side, cards, label, reveal) {
          const st = this.state, p = st.players[side];
          const lim = handLimitFor(side, st);
          if (lim >= HAND_LIMIT) return oAddToHand.apply(this, arguments);
          const room = Math.max(0, lim - p.hand.length);
          let keep = cards, over = [];
          if (cards.length > room) {
            if (room === 0 || cards.length === 1) {
              keep = [];
              over = cards.slice();
            } else {
              const ops = this._opsFor(side, { source: p.field, kind: "handLimit" });
              let chosen = null;
              ops.pickCards({ title: "手札上限", message: "手札に残すカードを" + room + "枚選んでください（残りはトラッシュ）", cards: cards.slice(), count: room, mode: "exact" }, (r) => {
                chosen = r;
              });
              if (!chosen) throw new env.GD1Unsupported("handLimit decision did not complete");
              keep = chosen.slice();
              over = cards.filter((c) => keep.indexOf(c) === -1);
            }
          }
          keep.forEach((c) => {
            this._resetOffField(c);
            p.hand.push(c);
            this._logCard(side, (label || "ドロー") + "：" + p.label + " " + nameOf(c), (label || "ドロー") + "：" + p.label + " 1枚", reveal);
            if (GAME_EVENT.CARD_DRAWN) this.emit(GAME_EVENT.CARD_DRAWN, { side, card: c, label });
          });
          over.forEach((c) => {
            this._resetOffField(c);
            p.trash.push(c);
            st.log.push("手札上限（" + lim + "枚）のため、《" + nameOf(c) + "》はトラッシュへ");
          });
          return keep.length;
        };
        Game.isHandFull = function(side) {
          return this.state.players[side].hand.length >= handLimitFor(side, this.state);
        };
        undo.push(() => {
          Game._addToHand = oAddToHand;
          Game.isHandFull = oIsHandFull;
        });
        const oTempTargets = Game._tempTargets;
        Game._tempTargets = function(e, inst) {
          if (!oTempTargets.call(this, e, inst)) return false;
          if (e.trackedBy) {
            const t = this.state.tracking[e.trackedBy.side];
            if (!t) return false;
            if (e.trackedBy.trait && !hasTrait(t.youkai, e.trackedBy.trait)) return false;
            if (t.humans.indexOf(inst) === -1) return false;
          }
          return true;
        };
        undo.push(() => {
          Game._tempTargets = oTempTargets;
        });
        const oDealDmg = Game.dealEffectDamage;
        Game.dealEffectDamage = function(target, amount, sourceName, bySide) {
          if (bySide != null && bySide !== target.owner) {
            const P = this.state.players[target.owner];
            let red = 0;
            units(P).forEach((u) => {
              const d = def(u.cardId);
              if (d && d.damageShield) red += d.damageShield(target, this.state, u) || 0;
            });
            if (red >= amount) {
              this.state.log.push("★軽減：" + nameOf(target) + " は " + (sourceName || "効果") + " のダメージ" + amount + "を受けない");
              return 0;
            }
            if (red > 0) amount = amount - red;
          }
          return oDealDmg.call(this, target, amount, sourceName, bySide);
        };
        undo.push(() => {
          Game.dealEffectDamage = oDealDmg;
        });
        const oImmune = E.isImmuneToOppTargeting;
        E.isImmuneToOppTargeting = function(card, state) {
          if (oImmune.call(this, card, state)) return true;
          for (const e of state.tempEffects) if (e.kind === "targetImmune" && Game._tempTargets(e, card)) return true;
          for (const g of card.equipment || []) {
            const d = def(g.cardId);
            if (d && d.grantsTargetImmunity) return true;
          }
          return false;
        };
        undo.push(() => {
          E.isImmuneToOppTargeting = oImmune;
        });
        const oRunEffect0 = Game.runEffect;
        Game.runEffect = function(item, uiOps, done) {
          const st = this.state, prev = st._fxSide;
          st._fxSide = item ? item.side : null;
          const self = this;
          return oRunEffect0.call(this, item, uiOps, function() {
            st._fxSide = prev;
            if (done) done();
          });
        };
        const oRecalc = Game.recalcAndResolveDeaths, oFinish = Game.finishAttack;
        Game.recalcAndResolveDeaths = function() {
          const st = this.state, p = st._deathResolve;
          st._deathResolve = true;
          try {
            return oRecalc.apply(this, arguments);
          } finally {
            st._deathResolve = p;
          }
        };
        Game.finishAttack = function() {
          const st = this.state, p = st._deathResolve;
          st._deathResolve = true;
          try {
            return oFinish.apply(this, arguments);
          } finally {
            st._deathResolve = p;
          }
        };
        const oLeaveField = Game._leaveField;
        Game._leaveField = function(inst, dest, why) {
          const st = this.state;
          if (!st._deathResolve && st._fxSide != null && st._fxSide !== inst.owner && st.tempEffects.some((e) => e.kind === "leaveProtect" && Game._tempTargets(e, inst))) {
            st.log.push("★結界：" + nameOf(inst) + " は相手の効果によって場を離れない");
            return;
          }
          inst._leftGoodsUids = (inst.equipment || []).map((g) => g.uid);
          return oLeaveField.apply(this, arguments);
        };
        undo.push(() => {
          Game.runEffect = oRunEffect0;
          Game.recalcAndResolveDeaths = oRecalc;
          Game.finishAttack = oFinish;
          Game._leaveField = oLeaveField;
        });
        function toDeckBottom(inst, why) {
          const st = Game.state, p = st.players[inst.owner];
          Game._leaveField(inst, "trash", why);
          const i = p.trash.indexOf(inst);
          if (i === -1) return false;
          p.trash.splice(i, 1);
          Game._resetOffField(inst);
          p.deck.push(inst);
          st.log.push("移動：" + p.label + " " + nameOf(inst) + " → デッキの下（" + (why || "効果") + "）");
          return true;
        }
        function retrack(yk, newHuman, why) {
          const st = Game.state, side = yk.owner, t = st.tracking[side];
          if (!t || t.youkai !== yk) return false;
          t.humans.forEach((h) => {
            h.tracking = false;
          });
          t.humans = [newHuman];
          t.human = newHuman;
          newHuman.tracking = true;
          st.log.push("追跡先変更：" + nameOf(yk) + " → " + nameOf(newHuman) + (why ? "（" + why + "）" : ""));
          return true;
        }
        function loseEnergy(side, n, why) {
          const p = Game.state.players[side], b = p.energy;
          p.energy = Math.max(0, p.energy - n);
          Game.state.log.push("気力減少：" + p.label + " " + b + " → " + p.energy + (why ? "（" + why + "）" : ""));
          return b - p.energy;
        }
        function extraNoise(actorSide, st, why) {
          st.tempEffects.filter((e) => e.kind === "extraNoise" && e.owner !== actorSide).forEach((e) => {
            Game.gainNoise(e.owner, e.amount || 1, (e.note || "木霊") + "：" + why);
          });
        }
        const oOnPursuit = E.onPursuitDeclared;
        E.onPursuitDeclared = function(side, yk, humans, state) {
          const r = oOnPursuit.apply(this, arguments);
          const O = state.players[otherSide(side)];
          units(O).slice().forEach((u) => {
            const d = def(u.cardId);
            if (d && d.onOppPursuit) d.onOppPursuit(side, yk, humans, state, u);
          });
          extraNoise(side, state, "相手が追跡を宣言した");
          return r;
        };
        undo.push(() => {
          E.onPursuitDeclared = oOnPursuit;
        });
        const oOnCardUsed = E.onCardUsed;
        E.onCardUsed = function(user, inst, how, state) {
          const r = oOnCardUsed.apply(this, arguments);
          const O = state.players[otherSide(user)];
          units(O).slice().forEach((u) => {
            const d = def(u.cardId);
            if (d && d.onOppCardUsed) d.onOppCardUsed(user, inst, how, state, u);
          });
          extraNoise(user, state, "相手がカードを使った");
          return r;
        };
        undo.push(() => {
          E.onCardUsed = oOnCardUsed;
        });
        did.push("★エンジン拡張層：相手コスト干渉／相手プレイ制限／手札上限／持続の選ばれない／場を離れない／デッキの下／追跡先変更／気力減少／相手追跡フック／相手使用フック");
        return {
          env,
          M,
          DECKS,
          E,
          Game,
          undo,
          did,
          hasTrait,
          countTrait,
          originalCost,
          otherSide,
          nameOf,
          hasKw,
          def,
          units,
          isUnit,
          MAX_YOUKAI,
          MAX_HUMANS,
          HAND_LIMIT,
          setHook,
          dropHook,
          defineCard,
          setText,
          setStats,
          setPool,
          setDeckName,
          setEquip,
          addMaster,
          pickOppTarget,
          pickOwnTarget,
          lookTake,
          takeFromTrash,
          summonOneFromTrash,
          drawN,
          pump,
          dmg,
          ownAssaultUntil,
          oppAssaultUntil,
          nextTurnStartUntil,
          oppTurnEndUntil,
          selfStat,
          onceTurn,
          onceGame,
          discardOwnChoice,
          opponentDiscards,
          lookerDiscards,
          useEventFromTrash,
          toDeckBottom,
          retrack,
          loseEnergy,
          handLimitFor,
          restore() {
            undo.slice().reverse().forEach((f) => {
              try {
                f();
              } catch (e) {
              }
            });
          }
        };
      }
      module.exports = { makeKit };
    }
  });

  // src/rules/L07-pool-a.js
  var require_L07_pool_a = __commonJS({
    "src/rules/L07-pool-a.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var { makeKit } = require_L07a_pool_a_core();
      var NEW_SHUFFLE = "YUEN-035";
      var BOILER = "HOTEL-009";
      var HITO5 = "HOTEL-025";
      function patchPoolA(env) {
        const NERF = String(CONFIG.POOL_A_NERF || "").split(",").map((s) => s.trim()).filter(Boolean);
        const has = (f) => NERF.indexOf(f) !== -1;
        const K = makeKit(env);
        const {
          M,
          E,
          Game,
          did,
          hasTrait,
          countTrait,
          originalCost,
          otherSide,
          nameOf,
          hasKw,
          isUnit,
          MAX_YOUKAI,
          MAX_HUMANS,
          setHook,
          dropHook,
          defineCard,
          setText,
          setStats,
          setPool,
          setDeckName,
          setEquip,
          addMaster,
          pickOppTarget,
          pickOwnTarget,
          lookTake,
          takeFromTrash,
          summonOneFromTrash,
          drawN,
          pump,
          dmg,
          ownAssaultUntil,
          oppAssaultUntil,
          nextTurnStartUntil,
          oppTurnEndUntil,
          selfStat,
          onceTurn,
          discardOwnChoice,
          opponentDiscards,
          lookerDiscards,
          useEventFromTrash,
          toDeckBottom,
          retrack,
          loseEnergy
        } = K;
        const missing = [];
        const hasCard = (id) => {
          if (M[id]) return true;
          if (missing.indexOf(id) === -1) missing.push(id);
          return false;
        };
        function card(id, text, stats, hooks, note) {
          if (!hasCard(id)) return false;
          if (stats) setStats(id, stats[0], stats[1], stats[2]);
          if (text != null) setText(id, text);
          if (hooks) defineCard(id, hooks, note || M[id].name + " を実装");
          else if (note) did.push(note);
          return true;
        }
        if (!has("noHeienFix")) {
          card("YUEN-029", "【1ターン1枚】相手の怪異すべての追跡を解除する。次の相手のターン、相手は追跡できない", null, {
            event(ctx, done) {
              const opp = otherSide(ctx.side);
              const t = ctx.state.tracking[opp];
              const n = ctx.opponent.youkai.length;
              if (t) Game.clearPursuitOf(t.youkai, "閉園時間");
              Game.addTempEffect({
                kind: "pursuitBan",
                owner: ctx.side,
                banSide: opp,
                target: null,
                targetUid: null,
                until: oppTurnEndUntil(),
                note: "閉園時間：次の相手のターン、追跡できない"
              });
              ctx.log("閉園時間：相手の怪異" + n + "枚の追跡を解除し、次の相手のターンは追跡できない");
              done();
            }
          }, "★閉園時間：追跡禁止を until oppAssault → oppTurnEnd に（旧実装では禁止が一度も働いていなかった）");
        }
        function boilerArmed(inst, st) {
          if (!inst || inst.cardId !== BOILER) return false;
          if (has("boilerVanilla")) return false;
          return st.players[otherSide(inst.owner)].humans.length >= 3;
        }
        const oHasDP = Game.hasDoublePursuit;
        Game.hasDoublePursuit = function(yk) {
          if (yk && yk.cardId === BOILER) return boilerArmed(yk, this.state);
          return oHasDP.call(this, yk);
        };
        K.undo.push(() => {
          Game.hasDoublePursuit = oHasDP;
        });
        const dpOf = (inst, st) => inst && inst.cardId === BOILER ? boilerArmed(inst, st || Game.state) : hasKw(inst, "【二重追跡】");
        card(
          BOILER,
          "相手の場に人間が3枚あるなら、このカードは【二重追跡】を持つ",
          [4, 4, 7],
          {},
          "★ボイラー：【登場時】強制登場 → 条件付き【二重追跡】（相手の場に人間3枚）に差し替え"
        );
        setHook("FIELD-HOTEL", "cost", function(side, inst, m, st) {
          const p = st.players[side];
          if (m.type !== "event" || !(m.traits || []).includes("ホテル")) return [];
          if (!p.youkai.some((c) => dpOf(c, st))) return [];
          if (p.turnUse.hotelEvent) return [];
          return [{ delta: -1, note: "～雪山ホテル～：〔ホテル〕イベント-1（ターンに1回）" }];
        }, "★～雪山ホテル～：【二重追跡】の判定を条件付き付与に対応");
        const oOnCardUsedH = E.onCardUsed;
        E.onCardUsed = function(user, inst, how, state) {
          const r = oOnCardUsedH.apply(this, arguments);
          const U = state.players[user];
          if (how && how.type === "event" && hasTrait(inst, "ホテル") && U.field.cardId === "FIELD-HOTEL" && !U.turnUse.hotelEvent && U.youkai.some((c) => dpOf(c, state))) U.turnUse.hotelEvent = 1;
          return r;
        };
        K.undo.push(() => {
          E.onCardUsed = oOnCardUsedH;
        });
        setHook("HOTEL-012", "event", function(ctx, done) {
          pickOwnTarget(
            ctx,
            ctx.me.youkai.filter((c) => dpOf(c, ctx.state)),
            "深夜営業",
            "スピード+2する【二重追跡】怪異",
            done,
            (t) => {
              pump(ctx, t, 2, 0, ownAssaultUntil());
              done();
            }
          );
        }, "★深夜営業：【二重追跡】の判定を条件付き付与に対応");
        setHook("HOTEL-003", "enter", function(ctx, done) {
          const looked = Game.lookTopOfDeck(ctx.side, 5);
          ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
          if (!looked.length) {
            done();
            return;
          }
          const taken = [];
          const step = (list, title, next) => {
            if (!list.length) {
              next();
              return;
            }
            ctx.pickCards(
              { title, message: "手札へ加えるカードを選んでください（0〜1枚）", cards: looked, selectable: list, count: 1, mode: "max" },
              (ch) => {
                if (ch && ch.length) taken.push(ch[0]);
                next();
              }
            );
          };
          const dp = looked.filter((c) => c.master.type === "youkai" && dpOf(c, ctx.state));
          step(dp, "マルグリット（1/2）", () => {
            const ev = looked.filter((c) => c.master.type === "event" && hasTrait(c, "ホテル") && taken.indexOf(c) === -1);
            step(ev, "マルグリット（2/2）", () => {
              Game.resolveLook(ctx.side, looked, taken, true, "random");
              ctx.showCards(taken, done);
            });
          });
        }, "★マルグリット：【二重追跡】の判定を条件付き付与に対応");
        setHook("HOTEL-024", "goodsBonus", function(goods, host, st) {
          return dpOf(host, st) ? { speed: 1, hp: 0 } : { speed: 0, hp: 0 };
        }, "★呪われた懐中時計：「【二重追跡】ならさらに+1」を実装（これまでハンドラ自体が無く未実装だった）");
        function hito5Decide(st, owner, victim) {
          if (has("hito5Never")) return false;
          const P = st.players[owner];
          if (!P.hand.length) return false;
          if (has("hito5Always")) return true;
          if (P.hand.length <= 2) return false;
          if (P.deck.length <= 3) return false;
          return originalCost(victim) >= 2;
        }
        card(HITO5, "相手の人間の【登場時】効果が発動する時、自分の手札1枚を捨てることができる。そうしたなら、その効果は発動しない", [3, 2, 6], null, null);
        const oRunEffect = Game.runEffect;
        Game.runEffect = function(item, uiOps, done) {
          const st = this.state;
          if (item && item.kind === "enter" && item.source && item.source.master.type === "human" && !st.gameOver) {
            const victim = item.source, owner = otherSide(victim.owner);
            const P = st.players[owner];
            const holder = P.humans.filter((c) => c.cardId === HITO5)[0];
            if (holder && hito5Decide(st, owner, victim)) {
              Game.discardFromHand(owner, [P.hand[0]], "ホ人5（打ち消し）");
              st.log.push("★ホ人5：" + P.label + " が手札1枚を捨て、" + nameOf(victim) + " の【登場時】を打ち消した");
              st.effectUsed["HOTEL-025:counter"] = (st.effectUsed["HOTEL-025:counter"] || 0) + 1;
              if (done) done();
              return;
            }
          }
          return oRunEffect.apply(this, arguments);
        };
        K.undo.push(() => {
          Game.runEffect = oRunEffect;
        });
        did.push("★ホ人5：割り込み（相手の人間の【登場時】を手札1枚で打ち消す）を実装" + (has("hito5Always") ? "／判断=常に打ち消す" : has("hito5Never") ? "／判断=打ち消さない" : "／判断=元コスト2以上かつ手札3枚以上かつ山札4枚以上"));
        addMaster(NEW_SHUFFLE, {
          id: NEW_SHUFFLE,
          name: "シャッフル札",
          faction: "YUEN",
          deck: "遊園地",
          pool: "base",
          type: "event",
          cost: 1,
          traits: ["遊園地"],
          attribute: null,
          attributeProvisional: false,
          effect: "【1ターン1枚】自分のデッキをシャッフルする",
          baseCount: null,
          oncePerTurnName: true
        });
        setHook(NEW_SHUFFLE, "event", function(ctx, done) {
          Game._shuffle("shuffle:" + ctx.side + ":" + ctx.state.turnCount, ctx.me.deck);
          ctx.log("シャッフル札：自分のデッキをシャッフルした（" + ctx.me.deck.length + "枚／見晴らしで覚えた順番は消える）");
          done();
        }, "★シャッフル札（新規 " + NEW_SHUFFLE + "）：デッキのシャッフルを明示的操作として実装");
        if (!has("noUpdate")) {
          card(
            "SHIMA-009",
            "【離れた時】自分のデッキの上から2枚を見る。その中から特徴〔島〕を持つ人間/怪異1枚を手札に加えることができる。残りをデッキの下に戻す",
            null,
            { leave(ctx, done) {
              lookTake(ctx, 2, (c) => isUnit(c) && hasTrait(c, "島"), { bottom: "choose" }, done);
            } }
          );
          card(
            "SHIMA-008",
            "【登場時】自分のデッキの上から2枚を見る。その中から特徴〔島〕を持つカード1枚を手札に加えることができる。残りをデッキの下に戻す",
            null,
            { enter(ctx, done) {
              lookTake(ctx, 2, (c) => hasTrait(c, "島"), { bottom: "choose" }, done);
            } }
          );
          card(
            "GAKKO-007",
            "【離れた時】自分のデッキの上から2枚を見る。その中から特徴〔学校〕を持つ怪異1枚を手札に加えることができる。残りをデッキの下に戻す",
            null,
            { leave(ctx, done) {
              lookTake(ctx, 2, (c) => c.master.type === "youkai" && hasTrait(c, "学校"), { bottom: "choose" }, done);
            } }
          );
          card(
            "DANCHI-004",
            "【離れた時】自分のデッキの上から2枚を見る。その中から特徴〔団地〕を持つ怪異1枚を手札に加えることができる。残りをデッキの下に戻す",
            null,
            { leave(ctx, done) {
              lookTake(ctx, 2, (c) => c.master.type === "youkai" && hasTrait(c, "団地"), { bottom: "choose" }, done);
            } }
          );
          card(
            "YAKATA-002",
            "【離れた時】自分のデッキの上から2枚を見る。その中から特徴〔洋館〕を持つ人間1枚を公開し、手札に加えることができる。残りをデッキの下に戻す",
            null,
            { leave(ctx, done) {
              lookTake(ctx, 2, (c) => c.master.type === "human" && hasTrait(c, "洋館"), { reveal: true, bottom: "choose" }, done);
            } }
          );
          card("MORI-003", null, [null, 2, 2], null);
          card("MORI-007", null, [null, 3, 1], null);
          card("MORI-017", null, [null, 2, 2], null);
          card("MORI-022", null, [null, 3, 7], null);
          card("GAKKO-005", null, [null, 2, 4], null);
          card("SHOTEN-012", null, [3, null, null], null);
          card(
            "YAKATA-024",
            null,
            [null, 4, 5],
            { leave(ctx, done) {
              if (hasTrait(ctx.me.field, "洋館")) Game.recoverEnergy(ctx.side, 2, "館I");
              else ctx.log("不発：フィールドが〔洋館〕ではない");
              done();
            } },
            "★館I：4/7→4/5。あわせて【離れた時】気力2回復を実装（これまで未実装だった）"
          );
          card(
            "CHOKOKU-016",
            null,
            [null, 2, 4],
            { enter(ctx, done) {
              lookTake(ctx, 3, (c) => c.master.type === "youkai" && hasTrait(c, "彫刻公園"), { bottom: "choose" }, done);
            } },
            "★マキ：2/3→2/4。あわせて【登場時】サーチを実装（これまで未実装だった）"
          );
          if (E.definitions["YORU-025"] && Object.keys(E.definitions["YORU-025"]).length) {
            did.push("※終電の切符は patch-yoru-v15 が実装済み（上書きしない）");
          } else {
            card(
              "YORU-025",
              null,
              null,
              { ownAssault(ctx, done) {
                if (!ctx.item.humansLost) {
                  done();
                  return;
                }
                opponentDiscards(ctx, 1, () => done(), "終電の切符");
              } },
              "★終電の切符：【自分の襲撃時】相手が1枚捨てるを実装（これまで未実装だった）"
            );
          }
          setPool("HOTEL-017", "base");
          setPool("YORU-025", "base");
          card("CHOKOKU-010", null, [3, 3, 5], null);
          card("CHOKOKU-019", null, [2, 2, 4], null);
          card("CHOKOKU-008", null, [2, 2, 4], null);
          card("CHOKOKU-009", null, [4, 3, 8], null);
          card(
            "YORU-008",
            "【離れた時】相手の手札を見て、その中から1枚を選び、捨てる",
            null,
            { leave(ctx, done) {
              lookerDiscards(ctx, 1, () => done());
            } },
            "★影の人B：【登場時】ランダム1枚捨て → 【離れた時】見て1枚捨てる"
          );
          if (hasCard("YUEN-009")) {
            if (/元のコスト\d+以上/.test(M["YUEN-009"].effect)) {
              const min = (M["YUEN-009"].effect.match(/元のコスト(\d+)以上/) || [])[1];
              did.push("※パレードの踏み倒し下限は patch-yuen-v15 が担当（いま 元のコスト" + min + "以上）。" + (min === "2" ? "§2 の指定どおり" : "★§2 の「元のコスト2以上」にするには YUEN_PARADE_MIN=2"));
            } else {
              setText(
                "YUEN-009",
                "自分のトラッシュに特徴〔遊園地〕を持つイベントが2枚あるごとに、このカードのコストを-1する。ただし、コストは4未満にならない／【登場時】自分のトラッシュから特徴〔遊園地〕を持つ元のコスト2以上のイベントを好きな枚数選び、それらを好きな順番で、コストを支払わずに使う。こうして使ったイベントはすべて除外する。この効果で使うイベントは、【1ターン1枚】の制限を受けない"
              );
              did.push("★パレード：テキストに「元のコスト2以上」を明記（patch-yuen 未適用時）");
            }
          }
          if (M["YUEN-032"]) {
            const t = M["YUEN-032"].effect;
            did.push(/元のコスト\d+以下/.test(t) ? "※打ち上げ花火は patch-yuen-v15 が「" + (t.match(/元のコスト(\d+)以下/) || [])[1] + "以下」に制限済み" : "★打ち上げ花火の「元のコスト2以下」は YUEN_UCHIAGE_MAX=2 で入れる（patch-yuen-v15 が担当）");
          } else missing.push("YUEN-032（打ち上げ花火・patch-yuen-v15 が作る）");
          if (M["COMMON-007"]) setDeckName("COMMON-007", "団地", "DANCHI");
          else missing.push("COMMON-007（汎G6・patch-yuen-v15 が作る）");
          card(
            "MORI-006",
            "〔森〕〔猟師〕｜自分のロストゾーンに特徴〔森〕を持つカードが3枚以上あるなら、このカードのコストは6になる／【登場時】相手の怪異1枚に3ダメージを与える／【自分のターン終了時】相手の怪異1枚に1ダメージを与える",
            null,
            null,
            "★サワ：テキストの括弧（ルピアの下限4で実質4）を note へ"
          );
          did.push("※～地下～（FIELD-CHIKA）の「特徴〔巨人〕を持つカード」は patch-chika-v15 の CHIKA_V17B=1 が担当。ここでは触らない");
        }
        if (!has("noNew")) {
          let rockTransform = function(ctx, payN, done) {
            if (!ctx.item.humansLost) {
              done();
              return;
            }
            const inst = ctx.source;
            let cut = 0;
            ctx.state.tempEffects.forEach((e) => {
              if (e.kind === "transformDiscount" && e.owner === ctx.side && (!e.trait || hasTrait(inst, e.trait))) cut += e.amount || 0;
            });
            const pay = Math.max(0, payN - cut);
            if (ctx.me.energy < pay) {
              ctx.log("不発：気力不足（" + pay + "）");
              done();
              return;
            }
            if (!inst.faces || inst.faceIndex + 1 >= inst.faces.length) {
              done();
              return;
            }
            ctx.confirmYesNo(nameOf(inst), "気力を" + pay + "支払って次の面に変身しますか？" + (cut ? "（神事で-" + cut + "）" : ""), (yes) => {
              if (yes) {
                ctx.me.energy -= pay;
                ctx.log("気力支払い：" + pay + (cut ? "（神事で-" + cut + "）" : ""));
                Game.transform(inst, inst.faceIndex + 1, "襲撃");
              }
              done();
            });
          }, playBan = function(ctx, types, label) {
            Game.addTempEffect({
              kind: "playBan",
              owner: ctx.side,
              banSide: otherSide(ctx.side),
              banTypes: types,
              until: nextTurnStartUntil(),
              note: label
            });
            ctx.log(label);
          }, exileFromTrash = function(ctx, n, title, done, cb) {
            const cands = ctx.me.trash.filter((c) => hasTrait(c, "村"));
            if (cands.length < n) {
              ctx.log("不発：トラッシュの〔村〕が" + n + "枚未満（" + title + "）");
              done();
              return;
            }
            ctx.pickCards({ title, message: "除外する〔村〕カードを" + n + "枚選んでください（0でもよい）", cards: cands, count: n, mode: "max" }, (ch) => {
              const list = ch || [];
              if (list.length < n) {
                ctx.log(title + "：除外しなかった");
                done();
                return;
              }
              const p = ctx.me;
              list.forEach((c) => {
                const i = p.trash.indexOf(c);
                if (i !== -1) {
                  p.trash.splice(i, 1);
                  p.exile.push(c);
                }
              });
              ctx.log("除外：" + p.label + " " + list.map(nameOf).join("・") + "（" + title + "）");
              cb();
            });
          };
          card("CHIKA-022", "自分の場に他の怪異が1枚あるごとに、このカードのスピードを+1する", [5, 3, 6], {
            static: selfStat((src, st) => {
              const n = st.players[src.owner].youkai.filter((c) => c !== src).length;
              return n ? { speed: n } : null;
            }, "地怪4")
          });
          if (hasCard("CHIKA-012")) {
            setStats("CHIKA-012", 1, null, null);
            setEquip("CHIKA-012", { type: "youkai", trait: "巨人", name: null }, { speed: 2 });
            setText("CHIKA-012", "装備できる相手：〔巨人〕怪異。スピード+2。効果なし。");
            defineCard("CHIKA-012", {}, "★地グ2：C3→C1・〔地下〕怪異＋条件付き+2 → 〔巨人〕怪異限定で素の+2");
          }
          card("CHIKA-014", null, null, { enter(ctx, done) {
            lookTake(ctx, 2, (c) => hasTrait(c, "駅員"), { bottom: "choose" }, done);
          } });
          card("CHIKA-023", null, null, { leave(ctx, done) {
            lookTake(ctx, 1, (c) => hasTrait(c, "駅員"), { count: 1, exact: true, bottom: "choose" }, done);
          } });
          card("CHIKA-020", null, null, {
            static: selfStat((src, st) => st.players[src.owner].youkai.some((c) => hasTrait(c, "巨人")) ? { speed: 1, hp: 1 } : null, "地怪2")
          });
          card("MORI-016", null, [4, 5, 5], {
            enter(ctx, done) {
              if (countTrait(ctx.me.lost, "森") < 3) {
                ctx.log("不発：ロストの〔森〕が3枚未満");
                done();
                return;
              }
              pickOppTarget(ctx, ctx.opponent.youkai, "森人6", "3ダメージを与える怪異", done, (t) => {
                dmg(ctx, t, 3);
                done();
              });
            }
          });
          card("MORI-019", null, null, { leave(ctx, done) {
            lookTake(ctx, 2, (c) => c.master.type === "youkai" && hasTrait(c, "森"), { bottom: "choose" }, done);
          } });
          card("MORI-015", null, null, {
            static: selfStat((src, st) => {
              const n = Math.floor(countTrait(st.players[src.owner].lost, "森") / 2);
              return n ? { speed: n } : null;
            }, "森人5")
          });
          card("MORI-020", null, null, {
            cost(side, inst, m, st) {
              const n = Math.floor(countTrait(st.players[side].lost, "森") / 2);
              return n ? [{ delta: -n, floor: 1, note: "森怪7：ロストの〔森〕2枚ごとに-" + n + "（下限1）" }] : [];
            }
          });
          card("SHIMA-018", null, null, { leave(ctx, done) {
            takeFromTrash(ctx, (c) => nameOf(c) === "岩の子", "島人9", done);
          } });
          card("SHIMA-019", null, null, {
            enter(ctx, done) {
              pickOwnTarget(ctx, ctx.me.youkai.filter((c) => hasTrait(c, "岩")), "島人10", "相手の効果によって選ばれなくする〔岩〕怪異", done, (t) => {
                Game.addTempEffect({ kind: "targetImmune", owner: ctx.side, target: { uid: t.uid }, until: nextTurnStartUntil(), note: "島人10：相手の効果によって選ばれない" });
                ctx.log("島人10：" + nameOf(t) + " は次の自分のターン開始時まで相手の効果によって選ばれない");
                done();
              });
            }
          });
          card("SHIMA-025", null, null, {
            event(ctx, done) {
              Game.addTempEffect({
                kind: "stat",
                owner: ctx.side,
                target: { owner: otherSide(ctx.side), types: ["human"] },
                trackedBy: { side: ctx.side, trait: "岩" },
                speed: -2,
                hp: 0,
                until: ownAssaultUntil(),
                note: "潮止まり：〔岩〕怪異が追跡している人間 スピード-2"
              });
              ctx.log("潮止まり：次の自分の襲撃時、〔岩〕怪異が追跡している人間のスピード-2");
              done();
            }
          });
          setHook("SHIMA-001", "ownAssault", function(ctx, done) {
            rockTransform(ctx, 2, done);
          }, "★岩の子：変身コストに神事の-2を通す");
          if (E.definitions["SHIMA-002"]) {
            const keepEnter = E.definitions["SHIMA-002"].enter;
            setHook("SHIMA-002", "ownAssault", function(ctx, done) {
              rockTransform(ctx, 3, done);
            }, "★岩の子（2面目）：変身コストに神事の-2を通す");
            if (keepEnter) setHook("SHIMA-002", "enter", keepEnter);
          }
          card("SHIMA-026", null, null, {
            event(ctx, done) {
              Game.addTempEffect({ kind: "transformDiscount", owner: ctx.side, target: null, trait: "岩", amount: 2, until: ownAssaultUntil(), note: "神事：変身の気力-2" });
              ctx.log("神事：次の自分の襲撃時、〔岩〕怪異の変身に支払う気力-2");
              done();
            }
          });
          card("HOTEL-018", null, null, {
            enter(ctx, done) {
              const opp = otherSide(ctx.side), P = ctx.opponent;
              if (P.humans.length >= MAX_HUMANS) {
                ctx.log("不発：相手の人間エリアが上限");
                done();
                return;
              }
              const cands = P.hand.filter((c) => c.master.type === "human" && Game.canPlay(opp, c, { free: true }).ok);
              if (!cands.length) {
                ctx.log("不発：相手が出せる人間がありません");
                done();
                return;
              }
              ctx.oppOps().pickCards({ title: "ベルボーイ（強制登場）", message: "場に出す人間を1枚選んでください（コストなし）", cards: cands, count: 1, mode: "exact" }, (chosen) => {
                const c = chosen && chosen[0];
                if (!c) {
                  done();
                  return;
                }
                const r = Game.playUnit(opp, c, { free: true, byEffect: true, controller: ctx.side });
                if (!r.ok) ctx.log("不発：" + r.reasons.join("／"));
                done();
              });
            }
          });
          card("HOTEL-020", null, null, {
            onOppCardUsed(user, inst, how, state, self) {
              if (!how || how.type !== "human") return;
              const side = self.owner;
              if (Game.isEffectUsed(Game.turnUseKey(side, "HOTEL-020:" + self.uid))) return;
              Game.markEffectUsed(Game.turnUseKey(side, "HOTEL-020:" + self.uid));
              E._react(state, side, self, "grandPiano", {});
            },
            react: { grandPiano(ctx, done) {
              drawN(ctx, 1);
              done();
            } }
          });
          card("HOTEL-016", null, null, {
            enter(ctx, done) {
              if (hasTrait(ctx.me.field, "ホテル") && ctx.opponent.humans.length >= 3) Game.recoverEnergy(ctx.side, 2, "アガタ");
              else ctx.log("不発：フィールドが〔ホテル〕でないか、相手の人間が3枚未満");
              done();
            }
          });
          card("HOTEL-019", null, null, {
            oppCost(side, inst, m, st, self) {
              return m.type === "human" ? [{ delta: 1, note: "木彫りの偶像：人間のコスト+1" }] : [];
            }
          });
          const oppHandLow = (src, st) => st.players[otherSide(src.owner)].hand.length <= 3;
          card("YORU-018", null, null, {
            enter(ctx, done) {
              if (ctx.opponent.hand.length <= 3) drawN(ctx, 2);
              else ctx.log("不発：相手の手札が4枚以上");
              done();
            }
          });
          card("YORU-022", null, null, {
            enter(ctx, done) {
              if (ctx.opponent.hand.length > 3) {
                ctx.log("不発：相手の手札が4枚以上");
                done();
                return;
              }
              pickOppTarget(ctx, ctx.opponent.youkai, "信号", "2ダメージを与える怪異", done, (t) => {
                dmg(ctx, t, 2);
                done();
              });
            }
          });
          card(
            "YORU-020",
            "相手の手札が3枚以下なら、このカードのスピードと体力を+2する",
            null,
            { static: selfStat((src, st) => oppHandLow(src, st) ? { speed: 2, hp: 2 } : null, "怪物B") }
          );
          card("YORU-023", null, null, {
            oppHandLimit: 3,
            static: selfStat((src, st) => oppHandLow(src, st) ? { speed: 2, hp: 2 } : null, "見下ろすもの")
          });
          card(
            "YORU-019",
            "相手の手札が3枚以下なら、このカードのスピードと体力を+2する",
            null,
            { static: selfStat((src, st) => oppHandLow(src, st) ? { speed: 2, hp: 2 } : null, "影の人C") }
          );
          card(
            "YORU-017",
            "相手の手札が3枚以下なら、このカードのスピードを+2する",
            [null, 2, 4],
            { static: selfStat((src, st) => oppHandLow(src, st) ? { speed: 2 } : null, "街人6") }
          );
          card("YORU-024", "装備できる相手：〔夜の街〕人間。体力+1。このカードを装備している人間が場を離れた時、相手の手札が3枚以下なら、自分は1枚ドローする", null, {
            hostLeft(ctx, done) {
              if (ctx.opponent.hand.length <= 3) drawN(ctx, 1);
              else ctx.log("不発：相手の手札が4枚以上（街灯）");
              done();
            }
          });
          if (hasCard("GEN2-014")) {
            const m = M["GEN2-014"];
            if (!(m.traits || []).includes("遊園地")) {
              const x = m.traits;
              m.traits = ["遊園地"];
              K.undo.push(() => {
                m.traits = x;
              });
            }
            defineCard("GEN2-014", { event(ctx, done) {
              playBan(ctx, ["event"], "イベントロック：次の自分のターン開始時まで、相手はイベントを使えない");
              done();
            } }, "イベントロック（1ターン）を実装");
          }
          if (hasCard("GEN3-008")) {
            const m = M["GEN3-008"];
            if (!(m.traits || []).includes("遊園地")) {
              const x = m.traits;
              m.traits = ["遊園地"];
              K.undo.push(() => {
                m.traits = x;
              });
            }
            defineCard("GEN3-008", { event(ctx, done) {
              playBan(ctx, ["goods"], "早じまい：次の自分のターン開始時まで、相手はグッズを使えない");
              done();
            } }, "早じまいを実装");
          }
          card("YUEN-020", "【登場時】自分のトラッシュから特徴〔遊園地〕を持つ元のコスト2以下のイベント1枚を選ぶ。そのカードをトラッシュに残したまま、コストを支払わずに使う", [3, 3, 5], {
            enter(ctx, done) {
              const cands = ctx.me.trash.filter((c) => c.master.type === "event" && hasTrait(c, "遊園地") && originalCost(c) <= 2);
              if (!cands.length) {
                ctx.log("不発：トラッシュに元のコスト2以下の〔遊園地〕イベントがない");
                done();
                return;
              }
              ctx.pickCards(
                { title: "動物ゾンビ（獣）", message: "コストを支払わずに使うイベントを1枚選んでください", cards: cands, count: 1, mode: "exact" },
                (ch) => {
                  const ev = ch && ch[0];
                  if (!ev) {
                    done();
                    return;
                  }
                  useEventFromTrash(ctx, ev, "stay", true, done);
                }
              );
            }
          });
          card("YUEN-012", null, null, {
            enter(ctx, done) {
              const cands = ctx.me.hand.filter((c) => c.master.type === "event" && hasTrait(c, "遊園地"));
              if (!cands.length) {
                ctx.log("不発：手札に〔遊園地〕イベントがない");
                done();
                return;
              }
              ctx.pickCards({ title: "園人5", message: "トラッシュに置く〔遊園地〕イベントを選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
                if (ch && ch.length) {
                  Game.discardFromHand(ctx.side, ch, "園人5");
                  drawN(ctx, 1);
                } else ctx.log("園人5：0枚を選択");
                done();
              });
            }
          });
          card("YUEN-013", null, null, {
            leave(ctx, done) {
              const looked = Game.lookTopOfDeck(ctx.side, 3);
              ctx.log("山札上" + looked.length + "枚を見た：" + ctx.me.label);
              if (!looked.length) {
                done();
                return;
              }
              const evs = looked.filter((c) => c.master.type === "event" && hasTrait(c, "遊園地"));
              const p = ctx.me;
              p.deck.splice(0, looked.length);
              evs.forEach((c) => p.trash.push(c));
              if (evs.length) ctx.log("シズカ：〔遊園地〕イベント" + evs.length + "枚をトラッシュへ");
              Game.putOnBottom(ctx.side, looked.filter((c) => evs.indexOf(c) === -1), "choose");
              done();
            }
          });
          card("CHOKOKU-023", null, [4, 4, 7], {
            banOppNonHandSummon: () => true,
            static: selfStat((src, st) => st.players[src.owner].noise.current >= 9 ? { speed: 2, hp: 2 } : null, "抽象の塊")
          });
          card("CHOKOKU-020", "【ターンに1回】自分は物音を2支払うことができる。そうしたなら、次の自分の襲撃時、このカードのスピードを+2する", [3, 2, 6], {
            abilities: [{
              key: "kabe",
              label: "物音2を支払い、次の自分の襲撃時にスピード+2",
              candidates(side, inst, st) {
                if (Game.isEffectUsed(Game.turnUseKey(side, "CHOKOKU-020:" + inst.uid))) return [];
                return st.players[side].noise.current >= 2 ? [inst] : [];
              },
              run(side, inst, target, st) {
                if (!Game.payNoise(side, 2)) return false;
                Game.markEffectUsed(Game.turnUseKey(side, "CHOKOKU-020:" + inst.uid));
                Game.addTempEffect({ kind: "stat", owner: side, target: { uid: inst.uid }, speed: 2, hp: 0, until: { type: "ownAssault" }, note: "壁の作品：スピード+2" });
                st.log.push("壁の作品：物音2を支払い、次の自分の襲撃時スピード+2");
                return true;
              }
            }]
          });
          card("CHOKOKU-022", null, [2, 3, 3], {
            static: selfStat((src, st) => st.players[src.owner].noise.current >= 9 ? { speed: 2 } : null, "人と機械")
          });
          card("CHOKOKU-014", null, null, {
            enter(ctx, done) {
              if (ctx.me.noise.current < 3) {
                ctx.log("不発：物音が3未満");
                done();
                return;
              }
              Game.queueEffect("noise", ctx.me.field, { tierTotal: ctx.me.noise.gained });
              ctx.log("フミ：自分のフィールドのランダムな効果を1回発動する");
              done();
            }
          });
          card("CHOKOKU-015", null, null, { leave(ctx, done) {
            Game.gainNoise(ctx.side, 2, "アカリ");
            done();
          } });
          card("CHOKOKU-025", null, null, {
            event(ctx, done) {
              Game.addTempEffect({ kind: "extraNoise", owner: ctx.side, target: null, amount: 1, until: nextTurnStartUntil(), note: "木霊" });
              ctx.log("木霊：次の自分のターン開始時まで、相手がカードを使うか追跡を宣言するたび物音+1");
              done();
            }
          });
          card("MURA-019", "【登場時】自分のトラッシュから特徴〔村〕を持つカードを3枚除外することができる。そうしたなら、相手の怪異1枚を選ぶ。その怪異は、次の相手のターン、追跡できない", null, {
            enter(ctx, done) {
              exileFromTrash(ctx, 3, "村A", done, () => {
                pickOppTarget(ctx, ctx.opponent.youkai, "村A", "次の相手のターン、追跡できなくする怪異", done, (t) => {
                  Game.addTempEffect({ kind: "pursuitBan", owner: ctx.side, banSide: otherSide(ctx.side), target: null, targetUid: t.uid, until: oppTurnEndUntil(), note: "村A：次の相手のターン、追跡できない" });
                  ctx.log("村A：" + nameOf(t) + " は次の相手のターン、追跡できない");
                  done();
                });
              });
            }
          });
          card("MURA-020", "【登場時】自分のトラッシュから特徴〔村〕を持つカードを5枚除外することができる。そうしたなら、相手の怪異すべては、次の相手のターン、追跡できない", null, {
            enter(ctx, done) {
              exileFromTrash(ctx, 5, "村B", done, () => {
                Game.addTempEffect({ kind: "pursuitBan", owner: ctx.side, banSide: otherSide(ctx.side), target: null, targetUid: null, until: oppTurnEndUntil(), note: "村B：次の相手のターン、追跡できない" });
                ctx.log("村B：相手の怪異すべては次の相手のターン、追跡できない");
                done();
              });
            }
          });
          card("MURA-025", null, null, {
            event(ctx, done) {
              const p = ctx.me;
              if (p.trash.length < 3) {
                ctx.log("不発：トラッシュが3枚未満（忘れられた名）");
                done();
                return;
              }
              ctx.pickCards({ title: "忘れられた名", message: "除外するカードを3枚選んでください", cards: p.trash.slice(), count: 3, mode: "exact" }, (ch) => {
                const list = ch || [];
                list.forEach((c) => {
                  const i = p.trash.indexOf(c);
                  if (i !== -1) {
                    p.trash.splice(i, 1);
                    p.exile.push(c);
                  }
                });
                ctx.log("除外：" + p.label + " " + list.map(nameOf).join("・") + "（忘れられた名）");
                pickOppTarget(ctx, ctx.opponent.youkai, "忘れられた名", "このターン体力を-1する怪異", done, (t) => {
                  pump(ctx, t, 0, -1, { type: "thisTurn" }, "忘れられた名：体力-1（このターン）");
                  done();
                });
              });
            }
          });
          card("MURA-022", null, null, {
            static: selfStat((src, st) => {
              const t = st.tracking[src.owner];
              return t && t.youkai === src && t.humans.some((h) => hasTrait(h, "制服")) ? { speed: 2 } : null;
            }, "村E")
          });
          card("MURA-017", null, null, { enter(ctx, done) {
            Game.trashTopOfDeck(ctx.side, 3);
            done();
          } });
          card("YAKATA-014", null, null, {
            enter(ctx, done) {
              const opp = otherSide(ctx.side), t = ctx.state.tracking[opp];
              const cands = t && t.humans.some((h) => h.owner === ctx.side && hasTrait(h, "洋館") && h.master.type === "human") ? [t.youkai] : [];
              if (!cands.length) {
                ctx.log("不発：〔洋館〕人間を追跡している相手の怪異がいない");
                done();
                return;
              }
              pickOppTarget(ctx, cands, "館3", "追跡先をこのカードに変更する怪異", done, (y) => {
                retrack(y, ctx.source, "館3");
                done();
              });
            }
          });
          card("YAKATA-017", null, null, {
            enter(ctx, done) {
              const hand = ctx.me.hand.filter((c) => c.master.type === "human" && hasTrait(c, "洋館"));
              const lost = ctx.me.lost.filter((c) => originalCost(c) >= 1);
              if (!hand.length || !lost.length) {
                ctx.log("不発：手札の〔洋館〕人間かロストの対象がない（館6）");
                done();
                return;
              }
              ctx.pickCards({ title: "館6", message: "公開する〔洋館〕人間を1枚選んでください（0〜1枚）", cards: hand, count: 1, mode: "max" }, (ch) => {
                const shown = ch && ch[0];
                if (!shown) {
                  ctx.log("館6：公開しなかった");
                  done();
                  return;
                }
                ctx.log("公開：" + nameOf(shown) + "（館6）");
                ctx.pickCards({ title: "館6", message: "ロストゾーンから手札に加えるカードを1枚選んでください", cards: lost, count: 1, mode: "exact" }, (ch2) => {
                  const got = ch2 && ch2[0];
                  if (got) {
                    const i = ctx.me.lost.indexOf(got);
                    if (i !== -1) ctx.me.lost.splice(i, 1);
                    Game._addToHand(ctx.side, [got], "館6（ロストから）", true);
                  }
                  Game._removeFromHand(ctx.side, shown);
                  Game._toLost(shown, "館6");
                  done();
                });
              });
            }
          });
          card("YAKATA-020", null, null, {
            cost(side, inst, m, st) {
              return countTrait(st.players[side].lost, "洋館") >= 2 ? [{ delta: -3, note: "館D：ロストの〔洋館〕2枚以上で-3" }] : [];
            },
            static(src, target, st) {
              if (target.owner === src.owner || target.master.type !== "human") return null;
              return { speed: -1, hp: 0, note: "館D：相手の人間スピード-1" };
            }
          });
          card("YAKATA-021", null, null, {
            cost(side, inst, m, st) {
              return countTrait(st.players[side].lost, "洋館") >= 3 ? [{ delta: -3, note: "館F：ロストの〔洋館〕3枚以上で-3" }] : [];
            },
            enter(ctx, done) {
              pickOppTarget(ctx, ctx.opponent.youkai, "館F", "トラッシュに置く怪異", done, (t) => {
                Game._leaveField(t, "trash", "館F");
                done();
              });
            },
            ownAssault(ctx, done) {
              pickOppTarget(ctx, ctx.opponent.humans, "館F", "2ダメージを与える人間", done, (t) => {
                dmg(ctx, t, 2);
                done();
              });
            }
          });
          card(
            "DANCHI-019",
            "【離れた時】自分のデッキの上から1枚を見る。それが特徴〔団地〕を持つ人間/怪異なら、手札に加えることができる。手札に加えなかったなら、トラッシュに置く",
            null,
            { leave(ctx, done) {
              lookTake(ctx, 1, (c) => isUnit(c) && hasTrait(c, "団地"), { bottom: "trash" }, done);
            } }
          );
          card("DANCHI-014", null, null, {
            static(src, target, st) {
              if (target.owner !== src.owner || target.master.type !== "youkai") return null;
              if (!hasTrait(target, "団地") || originalCost(target) > 1) return null;
              return { speed: 1, hp: 0, note: "団3：スピード+1" };
            }
          });
          card("DANCHI-023", "自分の特徴〔団地〕を持つ怪異は、相手の効果によってダメージを受けない", null, {
            damageShield(target, st, self) {
              if (target.owner !== self.owner || target.master.type !== "youkai") return 0;
              return hasTrait(target, "団地") ? Infinity : 0;
            }
          });
          card("DANCHI-015", null, null, { enter(ctx, done) {
            drawN(ctx, 1);
            done();
          } });
          card("GAKKO-022", null, null, {
            leave(ctx, done) {
              summonOneFromTrash(ctx, (c) => c.master.type === "youkai" && hasTrait(c, "学校") && originalCost(c) <= 1, "学怪3", done);
            }
          });
          card("GAKKO-023", "【自分の襲撃時】この襲撃で相手の人間がロストゾーンに置かれたなら、自分のデッキの上から2枚をトラッシュに置く", null, {
            ownAssault(ctx, done) {
              if (ctx.item.humansLost) Game.trashTopOfDeck(ctx.side, 2);
              done();
            }
          });
          card("GAKKO-018", null, null, {
            damageShield(target, st, self) {
              if (target.owner !== self.owner || target.master.type !== "youkai") return 0;
              return hasTrait(target, "学校") ? 1 : 0;
            }
          });
          card("SHOTEN-016", null, null, {
            leave(ctx, done) {
              const uids = ctx.source._leftGoodsUids || [];
              const goods = ctx.me.trash.filter((c) => uids.indexOf(c.uid) !== -1 && c.master.type === "goods");
              const hosts = ctx.me.humans.concat(ctx.me.youkai).filter((c) => hasTrait(c, "商店街"));
              if (!goods.length || !hosts.length) {
                ctx.log("不発：付け直すグッズか相手がいない（商人6）");
                done();
                return;
              }
              ctx.pickCards({ title: "商人6", message: "付け直すグッズを1枚選んでください（0〜1枚）", cards: goods, count: 1, mode: "max" }, (ch) => {
                const g = ch && ch[0];
                if (!g) {
                  done();
                  return;
                }
                const ok = hosts.filter((h) => Game._canEquipMore(h, g));
                if (!ok.length) {
                  ctx.log("不発：装備できる対象がいない（商人6）");
                  done();
                  return;
                }
                ctx.pickBoardTarget({ title: "商人6", message: "装備し直す〔商店街〕の人間/怪異を選んでください", candidates: ok }, (h) => {
                  if (h) {
                    Game.equipFromTrash(ctx.side, g, h);
                    Game.recalcAndResolveDeaths("装備時");
                  }
                  done();
                });
              });
            }
          });
          card("SHOTEN-022", null, null, {
            static: selfStat((src) => (src.equipment || []).length ? { speed: 1 } : null, "商怪6")
          });
          card("SHOTEN-024", null, null, {
            enter(ctx, done) {
              const host = ctx.source;
              const cands = ctx.me.trash.filter((c) => c.master.type === "goods" && hasTrait(c, "商店街") && Game._canEquipMore(host, c));
              if (!cands.length) {
                ctx.log("不発：トラッシュに装備できる〔商店街〕グッズがない");
                done();
                return;
              }
              ctx.pickCards({ title: "商怪8", message: "このカードに装備するグッズを1枚選んでください", cards: cands, count: 1, mode: "exact" }, (ch) => {
                const g = ch && ch[0];
                if (g) {
                  Game.equipFromTrash(ctx.side, g, host);
                  Game.recalcAndResolveDeaths("装備時");
                }
                done();
              });
            }
          });
          card("SHOTEN-026", null, null, {
            onEquip(ctx, done) {
              const cands = ctx.me.hand.filter((c) => c.master.type === "goods" && hasTrait(c, "商店街"));
              if (!cands.length) {
                ctx.log("不発：手札に〔商店街〕グッズがない（商グ6）");
                done();
                return;
              }
              ctx.pickCards(
                { title: "商グ6", message: "トラッシュに置く〔商店街〕グッズを選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" },
                (ch) => {
                  if (ch && ch.length) Game.discardFromHand(ctx.side, ch, "商グ6");
                  done();
                }
              );
            }
          });
          card("SHOTEN-015", null, null, {
            enter(ctx, done) {
              const looked = Game.lookTopOfDeck(ctx.side, 1);
              if (!looked.length) {
                done();
                return;
              }
              ctx.log("山札上1枚を見た：" + ctx.me.label);
              const c = looked[0];
              if (!(c.master.type === "goods" && hasTrait(c, "商店街"))) {
                ctx.log("商人5：〔商店街〕グッズではなかった（山札の上に戻す）");
                done();
                return;
              }
              ctx.pickOption({ title: "商人5", message: "山札の上の〔商店街〕グッズをトラッシュに置きますか？", cards: [c], options: [{ key: "yes", label: "トラッシュに置く" }, { key: "no", label: "置かない" }] }, (o) => {
                if (o && o.key === "yes") Game.trashTopOfDeck(ctx.side, 1);
                done();
              });
            }
          });
          card("COMMON-004", null, null, {
            event(ctx, done) {
              pickOppTarget(ctx, ctx.opponent.youkai, "確定除去", "デッキの下に置く怪異", done, (t) => {
                toDeckBottom(t, "確定除去");
                done();
              });
            }
          });
          card("GEN2-015", "【1ターン1枚】相手の元のコスト1以下の怪異1枚を選び、相手のデッキの下に置く", null, {
            event(ctx, done) {
              const cands = ctx.opponent.youkai.filter((c) => originalCost(c) <= 1);
              pickOppTarget(ctx, cands, "業火・小", "デッキの下に置く怪異（元のコスト1以下）", done, (t) => {
                toDeckBottom(t, "業火・小");
                done();
              });
            }
          });
          card("COMMON-002", null, null, { grantsTargetImmunity: true });
          card("GEN3-004", null, null, {
            event(ctx, done) {
              pickOppTarget(ctx, ctx.opponent.youkai, "足止め", "スピード-2する怪異", done, (t) => {
                pump(ctx, t, -2, 0, oppAssaultUntil(), "足止め：スピード-2（次の相手の襲撃時まで）");
                done();
              });
            }
          });
          card("GEN3-003", null, null, {
            event(ctx, done) {
              Game.addTempEffect({ kind: "stat", owner: ctx.side, target: { owner: ctx.side, types: ["youkai"] }, speed: 1, hp: 0, until: ownAssaultUntil(), note: "追い風：スピード+1" });
              ctx.log("追い風：次の自分の襲撃時、自分の怪異すべてのスピード+1");
              done();
            }
          });
          card("GEN3-005", null, null, {
            event(ctx, done) {
              Game.addTempEffect({ kind: "stat", owner: ctx.side, target: { owner: ctx.side, types: ["human"] }, speed: 1, hp: 0, until: oppAssaultUntil(), note: "反撃の構え：スピード+1" });
              ctx.log("反撃の構え：次の相手の襲撃時、自分の人間すべてのスピード+1");
              done();
            }
          });
          card("GEN3-001", null, null, {
            event(ctx, done) {
              pickOwnTarget(ctx, ctx.me.youkai, "結界", "相手の効果によって場を離れなくする怪異", done, (t) => {
                Game.addTempEffect({ kind: "leaveProtect", owner: ctx.side, target: { uid: t.uid }, until: nextTurnStartUntil(), note: "結界" });
                ctx.log("結界：" + nameOf(t) + " は次の自分のターン開始時まで相手の効果によって場を離れない");
                done();
              });
            }
          });
          card("GEN3-002", null, null, {
            event(ctx, done) {
              pickOwnTarget(ctx, ctx.me.youkai, "霧隠れ", "相手の効果によって選ばれなくする怪異", done, (t) => {
                Game.addTempEffect({ kind: "targetImmune", owner: ctx.side, target: { uid: t.uid }, until: nextTurnStartUntil(), note: "霧隠れ" });
                ctx.log("霧隠れ：" + nameOf(t) + " は次の自分のターン開始時まで相手の効果によって選ばれない");
                done();
              });
            }
          });
          card("GEN2-004", null, null, {
            onOppCardUsed(user, inst, how, state, self) {
              if (!how || how.from === "hand") return;
              if (how.type !== "human" && how.type !== "youkai") return;
              loseEnergy(user, 2, "踏み倒し課税");
            }
          });
          card("GEN2-001", null, null, {
            onOppPursuit(side, yk, humans, state, self) {
              loseEnergy(side, 1, "追跡課税");
            }
          });
        }
        if (missing.length) did.push("★存在しないID（実装できず）：" + missing.join("、"));
        const out = {
          applied: did,
          missing,
          newShuffleId: NEW_SHUFFLE,
          kit: K,
          restore() {
            K.restore();
          }
        };
        env.__poolA = out;
        return out;
      }
      module.exports = { patchPoolA, NEW_SHUFFLE };
    }
  });

  // src/rules/L08a-pool-b-core.js
  var require_L08a_pool_b_core = __commonJS({
    "src/rules/L08a-pool-b-core.js"(exports, module) {
      "use strict";
      function makeKitB(env, A) {
        const M = env.CARD_MASTER, E = env.Effects, Game = env.Game;
        const { hasTrait, originalCost, otherSide } = env.helpers;
        const HAND_LIMIT = env.constants.HAND_LIMIT;
        const undo = [], did = [];
        const nameOf = (c) => c.master.name;
        const def = (id) => E.definitions[id];
        const units = (p) => p.humans.concat(p.youkai);
        const bothUnits = (st) => units(st.players.village).concat(units(st.players.mansion));
        function findWith(st, key, side) {
          const list = side ? units(st.players[side]) : bothUnits(st);
          return list.filter((u) => {
            const d = def(u.cardId);
            return d && d[key];
          });
        }
        const oSig = Game.publicSignature;
        Game.publicSignature = function(st, side) {
          const base = oSig.call(this, st, side);
          const extra = st.tempEffects.map((e) => [
            e.kind,
            e.targetUid == null ? "" : e.targetUid,
            (e.banTypes || []).join("+"),
            e.limit == null ? "" : e.limit,
            e.trackedBy ? e.trackedBy.side + ":" + (e.trackedBy.trait || "") : "",
            e.amount == null ? "" : e.amount,
            e.costEq == null ? "" : e.costEq
          ].join("/")).join(";");
          return base + "|fx2:" + extra;
        };
        undo.push(() => {
          Game.publicSignature = oSig;
        });
        did.push("★publicSignature に targetUid / banTypes / limit / trackedBy / amount / costEq を追加（§1-4）");
        const oCalcRed = Game._calcReduction, oCalcY = Game._calcYoukaiReduction;
        Game._calcReduction = function(human, attackerSide) {
          const r = oCalcRed.apply(this, arguments);
          findWith(this.state, "assaultShield", human.owner).forEach((u) => {
            r.total += def(u.cardId).assaultShield(human, this.state, u) || 0;
          });
          return r;
        };
        Game._calcYoukaiReduction = function(yk, side) {
          let t = oCalcY.apply(this, arguments);
          findWith(this.state, "youkaiShield", yk.owner).forEach((u) => {
            t += def(u.cardId).youkaiShield(yk, this.state, u) || 0;
          });
          return t;
        };
        undo.push(() => {
          Game._calcReduction = oCalcRed;
          Game._calcYoukaiReduction = oCalcY;
        });
        const oCanEquip = Game._canEquipMore;
        Game._canEquipMore = function(host, goods) {
          if (oCanEquip.call(this, host, goods)) return true;
          const d = def(host.cardId);
          if (d && d.equipSlots) {
            const n = d.equipSlots(host, this.state) || 0;
            if (host.equipment.length < n && !host.equipment.some((g) => nameOf(g) === nameOf(goods))) return true;
          }
          return false;
        };
        undo.push(() => {
          Game._canEquipMore = oCanEquip;
        });
        const oOpsFor = Game._opsFor;
        Game._opsFor = function(side, item) {
          const ops = oOpsFor.apply(this, arguments);
          if (!ops || ops.__pbWrapped) return ops;
          const st = this.state, self = this;
          const w = Object.assign({}, ops, {
            pickBoardTarget(o, cb) {
              st._pickedTarget = true;
              return ops.pickBoardTarget.call(ops, o, cb);
            },
            __pbWrapped: true
          });
          return w;
        };
        undo.push(() => {
          Game._opsFor = oOpsFor;
        });
        const oRunE = Game.runEffect;
        Game.runEffect = function(item, uiOps, done) {
          const st = this.state, prev = st._pickedTarget;
          st._pickedTarget = false;
          return oRunE.call(this, item, uiOps, function() {
            st._pickedTarget = prev;
            if (done) done();
          });
        };
        undo.push(() => {
          Game.runEffect = oRunE;
        });
        const oDeal = Game.dealEffectDamage;
        Game.dealEffectDamage = function(target, amount, sourceName, bySide) {
          if (bySide != null && bySide !== target.owner && !this.state._pickedTarget) {
            const guards = findWith(this.state, "untargetedImmune", target.owner).filter((u) => def(u.cardId).untargetedImmune(target, this.state, u));
            if (guards.length) {
              this.state.log.push("★全体耐性：" + nameOf(target) + " は対象を選ばない効果のダメージを受けない（" + nameOf(guards[0]) + "）");
              return 0;
            }
          }
          return oDeal.apply(this, arguments);
        };
        undo.push(() => {
          Game.dealEffectDamage = oDeal;
        });
        function trashLocked(st) {
          return findWith(st, "trashLock").length > 0;
        }
        const oMTH = Game.moveTrashToHand, oSFT2 = Game.summonFromTrash, oEFT = Game.equipFromTrash, oUE = Game._useEvent;
        Game.moveTrashToHand = function(side, inst) {
          if (trashLocked(this.state)) {
            this.state.log.push("不発：トラッシュがロックされている（霧の案内人）");
            return false;
          }
          return oMTH.apply(this, arguments);
        };
        Game.summonFromTrash = function(side) {
          if (trashLocked(this.state)) {
            this.state.log.push("不発：トラッシュがロックされている（霧の案内人）");
            return null;
          }
          return oSFT2.apply(this, arguments);
        };
        Game.equipFromTrash = function(side) {
          if (trashLocked(this.state)) {
            this.state.log.push("不発：トラッシュがロックされている（霧の案内人）");
            return false;
          }
          return oEFT.apply(this, arguments);
        };
        Game._useEvent = function(side, inst, o) {
          if (o && o.from === "trash" && trashLocked(this.state)) {
            this.state.log.push("不発：トラッシュからは使えない（霧の案内人）");
            return;
          }
          return oUE.apply(this, arguments);
        };
        undo.push(() => {
          Game.moveTrashToHand = oMTH;
          Game.summonFromTrash = oSFT2;
          Game.equipFromTrash = oEFT;
          Game._useEvent = oUE;
        });
        const oDraw = Game.drawOne;
        Game.drawOne = function(side, label) {
          const st = this.state;
          if (st._fxSide != null) {
            if (findWith(st, "drawLock").length) {
              st.log.push("不発：効果ではカードを引けない（ドロー封じ）");
              return null;
            }
            if (st.tempEffects.some((e) => e.kind === "drawBan" && e.banSide === side)) {
              st.log.push("不発：効果ではカードを引けない");
              return null;
            }
          }
          return oDraw.apply(this, arguments);
        };
        undo.push(() => {
          Game.drawOne = oDraw;
        });
        const oSFT3 = Game.summonFromTrash, oSFL3 = Game.summonFromLost;
        function nonHandBanned(side, st) {
          return st.tempEffects.some((e) => e.kind === "nonHandBan" && e.banSide === side);
        }
        Game.summonFromTrash = function(side) {
          if (nonHandBanned(side, this.state)) {
            this.state.log.push("不発：手札以外から場に出せない（通行止め）");
            return null;
          }
          return oSFT3.apply(this, arguments);
        };
        Game.summonFromLost = function(side) {
          if (nonHandBanned(side, this.state)) {
            this.state.log.push("不発：手札以外から場に出せない（通行止め）");
            return null;
          }
          return oSFL3.apply(this, arguments);
        };
        undo.push(() => {
          Game.summonFromTrash = oSFT3;
          Game.summonFromLost = oSFL3;
        });
        const oAdd2 = Game._addToHand, oFull2 = Game.isHandFull;
        function limitOf(side, st) {
          let lim = HAND_LIMIT;
          st.tempEffects.forEach((e) => {
            if (e.kind === "handLimit" && e.banSide === side) lim = Math.min(lim, e.limit);
          });
          return lim;
        }
        Game._addToHand = function(side, cards, label, reveal) {
          const st = this.state, p = st.players[side];
          const lim = limitOf(side, st);
          if (lim >= HAND_LIMIT) return oAdd2.apply(this, arguments);
          const room = Math.max(0, lim - p.hand.length);
          const keep = cards.slice(0, room), over = cards.slice(room);
          keep.forEach((c) => {
            this._resetOffField(c);
            p.hand.push(c);
            this._logCard(side, (label || "ドロー") + "：" + p.label + " " + nameOf(c), (label || "ドロー") + "：" + p.label + " 1枚", reveal);
          });
          over.forEach((c) => {
            this._resetOffField(c);
            p.trash.push(c);
            st.log.push("手札上限（" + lim + "枚）のため、《" + nameOf(c) + "》はトラッシュへ");
          });
          return keep.length;
        };
        Game.isHandFull = function(side) {
          return this.state.players[side].hand.length >= limitOf(side, this.state);
        };
        undo.push(() => {
          Game._addToHand = oAdd2;
          Game.isHandFull = oFull2;
        });
        const oExpire = Game._expireEffects;
        Game._expireEffects = function(event, side) {
          const st = this.state;
          const before = st.tempEffects.slice();
          const r = oExpire.apply(this, arguments);
          before.forEach((e) => {
            if (e.kind !== "energyFreeze") return;
            if (st.tempEffects.indexOf(e) !== -1) return;
            Game.recoverEnergy(e.banSide, e.amount, "凍結が解ける");
          });
          return r;
        };
        undo.push(() => {
          Game._expireEffects = oExpire;
        });
        const oProt = Game.isPursuitProtected;
        Game.isPursuitProtected = function(yk) {
          if (oProt.call(this, yk)) return true;
          return findWith(this.state, "pursuitImmune", yk.owner).some((u) => def(u.cardId).pursuitImmune(yk, this.state, u));
        };
        undo.push(() => {
          Game.isPursuitProtected = oProt;
        });
        const oFinish = Game.finishAttack;
        Game.finishAttack = function(info) {
          const st = this.state;
          const walls = st.players[otherSide(info.side)].humans.filter((h) => info.defenders.indexOf(h) !== -1).filter((h) => {
            const d = def(h.cardId);
            return d && d.afterAssaultBanish;
          });
          const r = oFinish.apply(this, arguments);
          if (!st.gameOver && walls.length && info.attacker) {
            const p = st.players[info.attacker.owner];
            if (p.youkai.indexOf(info.attacker) !== -1) {
              A.toDeckBottom(info.attacker, nameOf(walls[0]));
              st.log.push("★" + nameOf(walls[0]) + "：襲撃した怪異を相手のデッキの下へ");
            }
          }
          return r;
        };
        undo.push(() => {
          Game.finishAttack = oFinish;
        });
        did.push("★拡張層（B）：襲撃軽減（人間/怪異）／複数装備の枠／対象を選ばない効果の判定／トラッシュのロック／ドロー禁止／持続の登場禁止と手札上限／気力の凍結／追跡の完全耐性／襲撃後の山下送り");
        return { undo, did, findWith, limitOf, restore() {
          undo.slice().reverse().forEach((f) => {
            try {
              f();
            } catch (e) {
            }
          });
        } };
      }
      module.exports = { makeKitB };
    }
  });

  // src/rules/L08-pool-b.js
  var require_L08_pool_b = __commonJS({
    "src/rules/L08-pool-b.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var { makeKitB } = require_L08a_pool_b_core();
      var { patchPoolA } = require_L07_pool_a();
      var MURA_NEW = "MURA-028";
      function patchPoolB(env) {
        const A = env.__poolA || patchPoolA(env);
        const K = A.kit;
        const B = makeKitB(env, K);
        const NERF = String(CONFIG.POOL_B_NERF || "").split(",").map((s) => s.trim()).filter(Boolean);
        const has = (f) => NERF.indexOf(f) !== -1;
        const HAND_TH = Number(CONFIG.YORU_HAND_THRESHOLD || 3) | 0;
        const REWARD_BODY = String(CONFIG.YORU_REWARD_BODY || "") === "1";
        const {
          M,
          E,
          Game,
          hasTrait,
          countTrait,
          originalCost,
          otherSide,
          nameOf,
          isUnit,
          MAX_YOUKAI,
          MAX_HUMANS,
          setHook,
          defineCard,
          setText,
          setStats,
          setPool,
          setDeckName,
          setEquip,
          addMaster,
          pickOppTarget,
          pickOwnTarget,
          lookTake,
          takeFromTrash,
          summonOneFromTrash,
          drawN,
          pump,
          dmg,
          ownAssaultUntil,
          oppAssaultUntil,
          nextTurnStartUntil,
          oppTurnEndUntil,
          selfStat,
          onceTurn,
          onceGame,
          discardOwnChoice,
          opponentDiscards,
          lookerDiscards,
          useEventFromTrash,
          toDeckBottom,
          retrack,
          loseEnergy
        } = K;
        const did = [];
        const missing = [];
        const say = (s) => did.push(s);
        function card(id, text, stats, hooks, note) {
          if (!M[id]) {
            if (missing.indexOf(id) === -1) missing.push(id);
            return false;
          }
          if (stats) setStats(id, stats[0], stats[1], stats[2]);
          if (text != null) setText(id, text);
          if (hooks) defineCard(id, hooks, note || M[id].name + " を実装");
          else if (note) say(note);
          return true;
        }
        const bounce = (inst, why) => Game.returnToHand(inst, why);
        function exileFromField(inst, why) {
          Game._leaveField(inst, "exile", why);
        }
        addMaster(MURA_NEW, {
          id: MURA_NEW,
          name: "村H（除外軸）",
          faction: "MURA",
          deck: "村",
          pool: "pool",
          type: "youkai",
          cost: 3,
          speed: 2,
          hp: 4,
          traits: ["村"],
          attribute: null,
          attributeProvisional: false,
          effect: "自分の除外ゾーンに特徴〔村〕を持つカードが2枚あるごとに、このカードのスピードと体力を+1する",
          baseCount: null
        });
        card(MURA_NEW, null, null, {
          static: selfStat((src, st) => {
            const n = Math.floor(countTrait(st.players[src.owner].exile, "村") / 2);
            return n ? { speed: n, hp: n } : null;
          }, "村H")
        }, "★MURA-028 村H（除外軸）を新規実装：除外の〔村〕2枚ごとに +1/+1");
        if (M["COMMON-007"]) {
          setDeckName("COMMON-007", "団地", "DANCHI");
          if (!(M["COMMON-007"].traits || []).includes("団地")) {
            const t = M["COMMON-007"].traits;
            M["COMMON-007"].traits = ["団地"];
            K.undo.push(() => {
              M["COMMON-007"].traits = t;
            });
          }
          say("★汎G6（COMMON-007）：団地所属・特徴〔団地〕を付与（§1-2）");
        } else missing.push("COMMON-007（patch-yuen-v15 が作る）");
        if (!M["YUEN-032"]) missing.push("YUEN-032（patch-yuen-v15 が作る）");
        B.did.forEach(say);
        card("MORI-007", null, [null, 3, 2], null, "★小獣 3/1 → 3/2 に戻す（森 −16.0pp の主因）");
        card("MORI-017", null, [null, 2, 3], null, "★森怪4 2/2 → 2/3 に戻す（同上）");
        if (M["MORI-008"]) {
          const old = M["MORI-008"].pool;
          M["MORI-008"].pool = "removed";
          K.undo.push(() => {
            M["MORI-008"].pool = old;
          });
          say("★中獣（MORI-008）を削除（森怪4 が 2/3 に戻ると下位互換）");
        }
        card(
          "CHIKA-014",
          "【登場時】自分のデッキの上から2枚を見る。その中から特徴〔地下〕を持つ人間1枚を手札に加えることができる。残りをデッキの下に戻す",
          [1, 2, 2],
          { enter(ctx, done) {
            lookTake(ctx, 2, (c) => c.master.type === "human" && hasTrait(c, "地下"), { bottom: "choose" }, done);
          } },
          "★地人3：〔駅員〕限定 → 〔地下〕人間（シズも含む）。2回とも機能しなかったため"
        );
        card(
          "CHIKA-023",
          "【離れた時】自分のデッキの上から5枚を見る。その中から特徴〔駅員〕を持つカード1枚を手札に加えることができる。残りをデッキの下に戻す",
          [2, 3, 4],
          { leave(ctx, done) {
            lookTake(ctx, 5, (c) => hasTrait(c, "駅員"), { bottom: "choose" }, done);
          } },
          "★地怪5：2コスト 3/4・山上5枚から〔駅員〕（死ぬとトラッシュ3枚とシズ回収が同時に進む）"
        );
        card(
          "CHIKA-022",
          "自分の場に他のカードが1枚あるごとに、このカードのスピードを+1する",
          [5, 3, 6],
          {
            static: selfStat((src, st) => {
              const p = st.players[src.owner];
              const n = p.humans.length + p.youkai.filter((c) => c !== src).length;
              return n ? { speed: n } : null;
            }, "地怪4")
          },
          "★地怪4：他の怪異 → ★他のカード（人間も数える）1枚ごとにスピード+1"
        );
        const BOILER = "HOTEL-009";
        card(
          BOILER,
          "相手が人間を場に出した時、次の自分の襲撃時まで、このカードは【二重追跡】を持つ",
          [4, 4, 7],
          {
            onOppCardUsed(user, inst, how, state, self) {
              if (!how || how.type !== "human") return;
              if (state.tempEffects.some((e) => e.kind === "boilerArmed" && e.targetUid === self.uid)) return;
              Game.addTempEffect({
                kind: "boilerArmed",
                owner: self.owner,
                target: { uid: self.uid },
                targetUid: self.uid,
                until: { type: "ownAssault" },
                note: "ボイラー：次の自分の襲撃時まで【二重追跡】"
              });
              state.log.push("★ボイラー：相手が人間を場に出したので、次の自分の襲撃時まで【二重追跡】");
            }
          },
          "★ボイラー：「相手の場に人間3枚」（7.6%しか立たない）→「相手が人間を出した時、次の自分の襲撃時まで」"
        );
        const oDP = Game.hasDoublePursuit;
        Game.hasDoublePursuit = function(yk) {
          if (yk && yk.cardId === BOILER) {
            return this.state.tempEffects.some((e) => e.kind === "boilerArmed" && e.targetUid === yk.uid);
          }
          return oDP.call(this, yk);
        };
        K.undo.push(() => {
          Game.hasDoublePursuit = oDP;
        });
        if (HAND_TH !== 3) {
          const TH = HAND_TH;
          const lowNow = (src, st) => st.players[otherSide(src.owner)].hand.length <= TH;
          [
            ["YORU-009", { speed: 1, hp: 1 }],
            ["YORU-020", { speed: 2, hp: 2 }],
            ["YORU-019", { speed: 2, hp: 2 }],
            ["YORU-023", { speed: 2, hp: 2 }],
            ["YORU-011", { speed: 2, hp: 2 }]
          ].forEach(([id, b]) => {
            const d = E.definitions[id];
            if (!d || !d.static) return;
            setHook(id, "static", selfStat((src, st) => lowNow(src, st) ? b : null, M[id].name));
          });
          setHook("YORU-017", "static", selfStat((src, st) => lowNow(src, st) ? { speed: 2 } : null, "街人6"));
          setHook("YORU-018", "enter", function(ctx, done) {
            if (ctx.opponent.hand.length <= TH) drawN(ctx, 2);
            else ctx.log("不発：相手の手札が" + (TH + 1) + "枚以上");
            done();
          });
          setHook("YORU-022", "enter", function(ctx, done) {
            if (ctx.opponent.hand.length > TH) {
              ctx.log("不発：相手の手札が" + (TH + 1) + "枚以上");
              done();
              return;
            }
            pickOppTarget(ctx, ctx.opponent.youkai, "信号", "2ダメージを与える怪異", done, (t) => {
              dmg(ctx, t, 2);
              done();
            });
          });
          setHook("YORU-024", "hostLeft", function(ctx, done) {
            if (ctx.opponent.hand.length <= TH) drawN(ctx, 1);
            done();
          });
          setHook("FIELD-YORU", "targetImmunityFor", function(c, st) {
            const p = st.players[c.owner];
            if (st.players[otherSide(c.owner)].hand.length > TH) return false;
            return c.master.type === "youkai" && hasTrait(c, "夜の街") && p.field.cardId === "FIELD-YORU";
          });
          [
            ["YORU-009", "相手の手札が" + TH + "枚以下なら、このカードのスピードと体力を+1する"],
            ["YORU-020", "相手の手札が" + TH + "枚以下なら、このカードのスピードと体力を+2する"],
            ["YORU-019", "相手の手札が" + TH + "枚以下なら、このカードのスピードと体力を+2する"],
            ["YORU-017", "相手の手札が" + TH + "枚以下なら、このカードのスピードを+2する"],
            ["YORU-018", "【登場時】相手の手札が" + TH + "枚以下なら、自分は2枚ドローする"],
            ["YORU-022", "【登場時】相手の手札が" + TH + "枚以下なら、相手の怪異1枚に2ダメージを与える"],
            ["FIELD-YORU", "相手の手札が" + TH + "枚以下なら、自分の特徴〔夜の街〕を持つ怪異は、相手の効果によって選ばれない。"]
          ].forEach(([id, t]) => setText(id, t));
          say("★夜の街 案(b)：「相手の手札が3枚以下」を " + TH + "枚以下 に（YORU_HAND_THRESHOLD=" + TH + "）");
        }
        if (REWARD_BODY) {
          setStats("YORU-017", null, 3, 4);
          setStats("YORU-019", null, 2, 3);
          say("★夜の街 案(c)：街人6 2/4→3/4、影の人C 2/2→2/3（YORU_REWARD_BODY=1）");
        }
        const oOCU = E.onCardUsed;
        E.onCardUsed = function(user, inst, how, state) {
          const r = oOCU.apply(this, arguments);
          const U = state.players[user];
          U.humans.concat(U.youkai).slice().forEach((u) => {
            const d = E.definitions[u.cardId];
            if (d && d.onOwnCardUsed) d.onOwnCardUsed(user, inst, how, state, u);
          });
          return r;
        };
        K.undo.push(() => {
          E.onCardUsed = oOCU;
        });
        const oPR = E.playRestriction;
        E.playRestriction = function(side, inst, m, state) {
          const r = oPR.apply(this, arguments);
          if (r) return r;
          for (const e of state.tempEffects) {
            if (e.kind !== "playBan" || e.banSide !== side || e.costEq == null) continue;
            if ((typeof m.cost === "number" ? m.cost : 0) === e.costEq) return e.note || "コスト宣言：このコストのカードは使えません";
          }
          return null;
        };
        K.undo.push(() => {
          E.playRestriction = oPR;
        });
        card("CHIKA-016", null, null, {
          assaultShield(human, st, self) {
            if (human !== self) return 0;
            return st.players[self.owner].youkai.some((c) => hasTrait(c, "巨人")) ? 1 : 0;
          }
        });
        card("CHIKA-017", null, null, {
          enter(ctx, done) {
            if (!ctx.me.youkai.some((c) => hasTrait(c, "巨人"))) {
              ctx.log("不発：〔巨人〕怪異がいない");
              done();
              return;
            }
            drawN(ctx, 1);
            if (!ctx.me.hand.length) {
              done();
              return;
            }
            ctx.pickCards({ title: "地人6", message: "デッキの下に置く手札を1枚選んでください", cards: ctx.me.hand.slice(), count: 1, mode: "exact" }, (ch) => {
              if (ch && ch.length) {
                Game._removeFromHand(ctx.side, ch[0]);
                Game.putOnBottom(ctx.side, ch, "choose");
              }
              done();
            });
          }
        });
        card("CHIKA-018", null, null, {
          enter(ctx, done) {
            summonOneFromTrash(ctx, (c) => c.master.type === "youkai" && hasTrait(c, "地下") && !hasTrait(c, "巨人"), "地人7", done);
          }
        });
        card("MORI-013", null, null, {
          leave(ctx, done) {
            if (hasTrait(ctx.me.field, "森")) Game.recoverEnergy(ctx.side, 1, "森人3");
            else ctx.log("不発：フィールドが〔森〕ではない");
            done();
          }
        });
        card("MORI-014", null, null, {
          enter(ctx, done) {
            const cands = ctx.me.humans.filter((c) => c !== ctx.source);
            if (!cands.length) {
              ctx.log("不発：他の人間がいない（森人4）");
              done();
              return;
            }
            ctx.pickCards({ title: "森人4", message: "ロストゾーンに置く自分の人間を選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
              if (ch && ch.length) {
                Game.sacrificeToLost(ctx.side, ch[0], "森人4");
                if (!ctx.isOver()) drawN(ctx, 2);
              } else ctx.log("森人4：ロストに置かなかった");
              done();
            });
          }
        });
        card("MORI-021", null, null, {
          static: selfStat((src, st) => {
            const n = st.players[src.owner].lost.filter((c) => c.master.type === "human" && hasTrait(c, "森")).length;
            return n >= 3 ? { speed: 2 } : null;
          }, "森怪8")
        });
        card("SHIMA-022", null, null, {
          event(ctx, done) {
            const cands = ctx.me.trash.filter((c) => nameOf(c) === "岩の子");
            if (!cands.length) {
              ctx.log("不発：トラッシュに「岩の子」がない");
              done();
              return;
            }
            Game.moveTrashToHand(ctx.side, cands[0]);
            ctx.showCards([cands[0]], done);
          }
        });
        card("SHIMA-017", null, null, {
          static(src, target, st) {
            if (target.owner !== src.owner || target.master.type !== "youkai" || !hasTrait(target, "岩")) return null;
            return { speed: 1, hp: 0, note: "島人8：〔岩〕怪異のスピード+1" };
          }
        });
        card("HOTEL-013", null, null, {
          enter(ctx, done) {
            lookTake(ctx, 3, (c) => c.master.type === "youkai" && hasTrait(c, "ホテル"), { bottom: "choose" }, done);
          }
        });
        card("HOTEL-014", null, null, { leave(ctx, done) {
          drawN(ctx, 1);
          done();
        } });
        card("HOTEL-021", null, null, {
          enter(ctx, done) {
            if (ctx.opponent.humans.length < 3) {
              ctx.log("不発：相手の人間が3枚未満（シャンデリア）");
              done();
              return;
            }
            ctx.opponent.humans.slice().forEach((h) => dmg(ctx, h, 1));
            done();
          }
        });
        card("YORU-015", null, null, { trashLock: true });
        card("YUEN-014", null, null, {
          onOwnCardUsed(user, inst, how, state, self) {
            if (!how || how.type !== "event") return;
            if (!hasTrait(state.players[user].field, "遊園地")) return;
            if (Game.isEffectUsed(Game.turnUseKey(user, "YUEN-014:" + self.uid))) return;
            Game.markEffectUsed(Game.turnUseKey(user, "YUEN-014:" + self.uid));
            E._react(state, user, self, "yuenJin7", {});
          },
          react: {
            yuenJin7(ctx, done) {
              pickOppTarget(ctx, ctx.opponent.youkai, "園人7", "1ダメージを与える怪異", done, (t) => {
                dmg(ctx, t, 1);
                done();
              });
            }
          }
        });
        const yuenEv = (c) => c.master.type === "event" && hasTrait(c, "遊園地");
        card("YUEN-015", null, null, { static: selfStat((src, st) => st.players[src.owner].trash.filter(yuenEv).length >= 6 ? { speed: 1, hp: 1 } : null, "園人8") });
        card("YUEN-017", null, null, { static: selfStat((src, st) => st.players[src.owner].trash.filter(yuenEv).length >= 4 ? { speed: 1, hp: 1 } : null, "童話の人形") });
        card("YUEN-016", null, null, { leave(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 1);
          done();
        } });
        if (M["YUEN-021"]) {
          setEquip("YUEN-021", { type: "youkai", trait: "遊園地", name: null }, {});
        }
        card("YUEN-021", null, null, { hostLeft(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 2);
          done();
        } });
        if (M["CHOKOKU-024"]) {
          setEquip("CHOKOKU-024", { type: "human", trait: "彫刻公園", name: null }, {});
        }
        card("CHOKOKU-024", null, null, {
          hostLeft(ctx, done) {
            Game.queueEffect("noise", ctx.me.field, { tierTotal: ctx.me.noise.gained });
            ctx.log("パンフレット：フィールドのランダムな効果を1回");
            done();
          }
        });
        card("CHOKOKU-017", null, null, {
          enter(ctx, done) {
            const hand = ctx.opponent.hand.slice();
            Game.recordHandLook(ctx.side, hand);
            ctx.log("手札を見た：" + ctx.me.label + " → " + ctx.opponent.label + "の手札" + hand.length + "枚");
            done();
          }
        });
        card("MURA-018", null, null, {
          enter(ctx, done) {
            const lost = ctx.me.lost.filter((c) => originalCost(c) >= 1);
            const after = () => summonOneFromTrash(ctx, (c) => c.master.type === "youkai" && originalCost(c) <= 2, "村5", done);
            if (!lost.length) {
              after();
              return;
            }
            ctx.pickCards({ title: "村5", message: "ロストからトラッシュに置くカードを選んでください（0〜1枚）", cards: lost, count: 1, mode: "max" }, (ch) => {
              if (ch && ch.length) {
                const i = ctx.me.lost.indexOf(ch[0]);
                if (i !== -1) {
                  ctx.me.lost.splice(i, 1);
                  ctx.me.trash.push(ch[0]);
                  ctx.log("村5：" + nameOf(ch[0]) + " をロストからトラッシュへ");
                }
              }
              after();
            });
          }
        });
        card("MURA-023", null, null, {
          leave(ctx, done) {
            const self = ctx.source;
            if (ctx.me.trash.indexOf(self) === -1) {
              done();
              return;
            }
            if (!ctx.me.hand.length) {
              ctx.log("不発：手札がない（村F）");
              done();
              return;
            }
            discardOwnChoice(ctx, 1, (dropped) => {
              if (dropped && dropped.length) Game.moveTrashToHand(ctx.side, self);
              done();
            }, "村F");
          }
        });
        card("MURA-024", null, null, { enter(ctx, done) {
          takeFromTrash(ctx, (c) => c.master.type === "goods", "村G", done);
        } });
        card("MURA-021", null, null, { leave(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 2);
          done();
        } });
        if (M["MURA-026"]) {
          setEquip("MURA-026", { type: "human", trait: null, name: null }, {});
        }
        card("MURA-026", null, null, { goodsBonus(g, host, st) {
          return st.players[g.owner].trash.length >= 10 ? { speed: 1, hp: 0 } : { speed: 0, hp: 0 };
        } });
        if (M["MURA-027"]) {
          setEquip("MURA-027", { type: "human", trait: null, name: null }, {});
        }
        card("MURA-027", null, null, { leave(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 2);
          done();
        } });
        card("YAKATA-013", null, null, {
          enter(ctx, done) {
            if (hasTrait(ctx.me.field, "洋館")) Game.recoverEnergy(ctx.side, 1, "館1");
            else ctx.log("不発：フィールドが〔洋館〕ではない");
            done();
          }
        });
        card("YAKATA-016", null, null, {
          enter(ctx, done) {
            if (ctx.me.humans.length >= MAX_HUMANS) {
              ctx.log("不発：人間エリアが上限（館5）");
              done();
              return;
            }
            const cands = ctx.me.lost.filter((c) => c.master.type === "human" && hasTrait(c, "洋館") && originalCost(c) >= 1);
            if (!cands.length) {
              ctx.log("不発：ロストに〔洋館〕人間がない（館5）");
              done();
              return;
            }
            ctx.pickCards({ title: "館5", message: "ロストから場に出す〔洋館〕人間を選んでください（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
              const c = ch && ch[0];
              if (c) {
                const i = ctx.me.lost.indexOf(c);
                if (i !== -1) {
                  ctx.me.lost.splice(i, 1);
                  Game._placeUnit(ctx.side, c, 0, "ロストから／コスト不要・館5", "lost");
                }
              }
              done();
            });
          }
        });
        card("YAKATA-019", null, null, {
          enter(ctx, done) {
            const cands = ctx.me.hand.filter((c) => String(nameOf(c)).indexOf("イザベラ") !== -1);
            if (!cands.length) {
              ctx.log("不発：手札に「イザベラ」がない（館B）");
              done();
              return;
            }
            ctx.pickCards({ title: "館B", message: "「イザベラ」を公開しますか（0〜1枚）", cards: cands, count: 1, mode: "max" }, (ch) => {
              if (ch && ch.length) {
                ctx.source._yakataB = true;
                ctx.log("公開：" + nameOf(ch[0]) + "（館B：スピード+1・永続）");
              }
              done();
            });
          },
          static: selfStat((src) => src._yakataB ? { speed: 1 } : null, "館B")
        });
        card("DANCHI-013", null, null, { enter(ctx, done) {
          takeFromTrash(ctx, (c) => c.master.type === "goods" && hasTrait(c, "団地"), "団2", done);
        } });
        card("DANCHI-017", null, null, {
          leave(ctx, done) {
            const goods = ctx.me.trash.filter((c) => c.master.type === "goods" && hasTrait(c, "団地"));
            const hosts = ctx.me.youkai.slice();
            if (!goods.length || !hosts.length) {
              ctx.log("不発：装備できるグッズか怪異がない（団8）");
              done();
              return;
            }
            ctx.pickCards({ title: "団8", message: "装備する〔団地〕グッズを選んでください（0〜1枚）", cards: goods, count: 1, mode: "max" }, (ch) => {
              const g = ch && ch[0];
              if (!g) {
                done();
                return;
              }
              const ok = hosts.filter((h) => Game._canEquipMore(h, g));
              if (!ok.length) {
                ctx.log("不発：装備できる怪異がいない（団8）");
                done();
                return;
              }
              ctx.pickBoardTarget({ title: "団8", message: "装備する怪異を選んでください", candidates: ok }, (h) => {
                if (h) {
                  Game.equipFromTrash(ctx.side, g, h);
                  Game.recalcAndResolveDeaths("装備時");
                }
                done();
              });
            });
          }
        });
        card("GAKKO-019", null, null, {
          enter(ctx, done) {
            if (!hasTrait(ctx.me.field, "学校")) {
              ctx.log("不発：フィールドが〔学校〕ではない（学人5）");
              done();
              return;
            }
            pickOppTarget(ctx, ctx.opponent.youkai, "学人5", "トラッシュに置く怪異", done, (t) => {
              Game._leaveField(t, "trash", "学人5");
              done();
            });
          }
        });
        card("SHOTEN-018", null, null, {
          enter(ctx, done) {
            lookTake(ctx, 3, (c) => c.master.type === "goods" && hasTrait(c, "商店街"), { bottom: "trash" }, done);
          }
        });
        card("SHOTEN-019", null, null, { equipSlots: () => 2 });
        card("SHOTEN-021", null, null, {
          leave(ctx, done) {
            lookTake(ctx, 1, (c) => c.master.type === "goods" && hasTrait(c, "商店街"), { count: 1, exact: true, bottom: "choose" }, done);
          }
        });
        card("SHOTEN-023", null, null, { enter(ctx, done) {
          Game.trashTopOfDeck(ctx.side, 2);
          done();
        } });
        card("SHOTEN-025", null, [3, 2, 5], {
          static: selfStat((src, st) => {
            const names = {};
            st.players[src.owner].trash.forEach((c) => {
              if (c.master.type === "goods" && hasTrait(c, "商店街")) names[nameOf(c)] = 1;
            });
            const n = Object.keys(names).length;
            return n ? { speed: n } : null;
          }, "商怪9")
        }, "★商怪9：4コスト 2/4 → 3コスト 2/5（ボスの指定）／トラッシュの名前の異なる〔商店街〕グッズ1枚ごとにスピード+1");
        card("GEN2-016", null, null, {
          event(ctx, done) {
            pickOppTarget(ctx, ctx.opponent.youkai, "業火・戻し", "相手の手札に戻す怪異", done, (t) => {
              bounce(t, "業火・戻し");
              done();
            });
          }
        });
        card("GEN2-017", null, null, {
          event(ctx, done) {
            pickOppTarget(ctx, ctx.opponent.youkai, "業火・除外", "除外する怪異", done, (t) => {
              exileFromField(t, "業火・除外");
              done();
            });
          }
        });
        card("GEN2-018", null, null, {
          event(ctx, done) {
            const list = ctx.targetable(ctx.opponent.youkai);
            if (!list.length) {
              ctx.log("不発：相手の怪異がいない（業火・二体）");
              done();
              return;
            }
            ctx.pickCards({ title: "業火・二体", message: "デッキの下に置く怪異を2枚まで選んでください", cards: list, count: Math.min(2, list.length), mode: "max" }, (ch) => {
              (ch || []).forEach((t) => toDeckBottom(t, "業火・二体"));
              done();
            });
          }
        });
        if (M["GEN2-020"]) {
          setEquip("GEN2-020", { type: "youkai", trait: null, name: null }, {});
        }
        card("GEN2-020", null, null, {
          ownAssault(ctx, done) {
            if (!ctx.item.humansLost) {
              done();
              return;
            }
            const host = ctx.source.equippedTo;
            if (host && host.accumulatedDamage > 0) {
              Game.healDamage(host, host.accumulatedDamage);
              ctx.log("吸血：" + nameOf(host) + " のダメージをすべて取り除いた");
            }
            done();
          }
        });
        card("GEN2-003", null, null, {
          onOppCardUsed(user, inst, how, state, self) {
            if (originalCost(inst) < 4) return;
            E._react(state, self.owner, self, "bigTax", {});
          },
          react: { bigTax(ctx, done) {
            opponentDiscards(ctx, 1, () => done(), "大型課税");
          } }
        });
        card("GEN2-008", null, null, {
          youkaiShield(yk, st, self) {
            return yk.owner === self.owner ? 1 : 0;
          }
        });
        card("GEN2-002", null, null, {
          oppCost(side, inst, m, st, self) {
            return m.type === "youkai" ? [{ delta: 1, note: "怪異課税：怪異のコスト+1" }] : [];
          }
        });
        card("GEN2-006", null, null, {
          untargetedImmune(target, st, self) {
            return target.owner === self.owner && target.master.type === "youkai";
          }
        });
        card("GEN2-007", null, null, {
          pursuitImmune(yk, st, self) {
            return yk.owner === self.owner;
          }
        });
        card("GEN2-011", null, null, { afterAssaultBanish: true });
        card("GEN2-009", null, null, {
          enter(ctx, done) {
            pickOppTarget(ctx, ctx.opponent.youkai, "バウンス持ち", "相手の手札に戻す怪異", done, (t) => {
              bounce(t, "バウンス持ち");
              done();
            });
          }
        });
        card("GEN2-010", null, [5, 4, 7], {
          ownAssault(ctx, done) {
            if (!ctx.item.humansLost) {
              done();
              return;
            }
            pickOppTarget(ctx, ctx.opponent.youkai, "狩人", "2ダメージを与える怪異", done, (t) => {
              dmg(ctx, t, 2);
              done();
            });
          }
        }, "★狩人：6コスト 5/8 → 5コスト 4/7（ボスの指定）");
        card("GEN4-003", null, null, {
          event(ctx, done) {
            const opp = otherSide(ctx.side);
            const took = loseEnergy(opp, 2, "気力凍結");
            if (took > 0) {
              Game.addTempEffect({ kind: "energyFreeze", owner: ctx.side, banSide: opp, target: null, amount: took, until: oppTurnEndUntil(), note: "気力凍結：" + took });
              ctx.log("気力凍結：相手の気力" + took + "を凍結（次の相手のターン終了時まで）");
            } else ctx.log("不発：相手の気力が0（気力凍結）");
            done();
          }
        });
        card("GEN4-004", null, null, {
          event(ctx, done) {
            if (ctx.opponent.humans.length < 2) {
              ctx.log("不発：相手の人間が2枚未満（人間バウンス）");
              done();
              return;
            }
            pickOppTarget(ctx, ctx.opponent.humans, "人間バウンス", "相手の手札に戻す人間", done, (t) => {
              bounce(t, "人間バウンス");
              done();
            });
          }
        });
        card("GEN4-010", null, null, {
          event(ctx, done) {
            Game.addTempEffect({ kind: "handLimit", owner: ctx.side, banSide: otherSide(ctx.side), limit: 3, until: nextTurnStartUntil(), note: "宵闇：手札上限3" });
            ctx.log("宵闇：次の自分のターン開始時まで、相手の手札上限は3枚");
            done();
          }
        });
        card("GEN4-001", null, null, {
          enter(ctx, done) {
            const mine = ctx.me.trash.slice(), theirs = ctx.opponent.trash.slice();
            const all = mine.concat(theirs);
            if (!all.length) {
              ctx.log("不発：どちらのトラッシュも空");
              done();
              return;
            }
            ctx.pickCards({ title: "墓地メタ", message: "デッキの下に置くカードを2枚まで選んでください", cards: all, count: Math.min(2, all.length), mode: "max" }, (ch) => {
              (ch || []).forEach((c) => {
                const p = Game.state.players[c.owner], i = p.trash.indexOf(c);
                if (i !== -1) {
                  p.trash.splice(i, 1);
                  Game._resetOffField(c);
                  p.deck.push(c);
                  ctx.log("デッキの下へ：" + p.label + " " + nameOf(c));
                }
              });
              done();
            });
          }
        });
        card("GEN2-013", null, null, {
          event(ctx, done) {
            const eq = [];
            ctx.opponent.humans.concat(ctx.opponent.youkai).forEach((u) => (u.equipment || []).forEach((g) => eq.push(g)));
            if (!eq.length) {
              ctx.log("不発：相手のグッズがない（グッズ破壊）");
              done();
              return;
            }
            ctx.pickCards({ title: "グッズ破壊", message: "デッキの下に置くグッズを1枚選んでください", cards: eq, count: 1, mode: "exact" }, (ch) => {
              const g = ch && ch[0];
              if (g) {
                const host = g.equippedTo;
                const p = Game.state.players[g.owner];
                if (host) Game._detachGoods(host, g);
                Game._resetOffField(g);
                p.deck.push(g);
                ctx.log("グッズ破壊：" + nameOf(g) + " を相手のデッキの下へ");
                Game.recalcAndResolveDeaths("グッズ破壊");
              }
              done();
            });
          }
        });
        if (!has("noC")) {
          card("GEN2-012", null, [4, 4, 7], {
            oppPlayRestriction(side, inst, m, st, self) {
              return m.type === "event" ? "イベントロック：イベントは使えません" : null;
            },
            static: selfStat((src, st) => st.players[src.owner].humans.length >= 3 ? { speed: 2, hp: 2 } : null, "イベントロック")
          }, "★イベントロック（怪異）：8コスト 4/12 → 4コスト 4/7（ボスの指定）");
          card("GEN2-005", null, null, { drawLock: true });
          card("GEN3-007", null, null, {
            event(ctx, done) {
              Game.addTempEffect({ kind: "nonHandBan", owner: ctx.side, banSide: otherSide(ctx.side), target: null, until: nextTurnStartUntil(), note: "通行止め" });
              ctx.log("通行止め：次の自分のターン開始時まで、相手は手札以外から出せない");
              done();
            }
          });
          card("GEN3-006", null, null, {
            event(ctx, done) {
              Game.addTempEffect({ kind: "drawBan", owner: ctx.side, banSide: otherSide(ctx.side), target: null, until: nextTurnStartUntil(), note: "静かな夜" });
              ctx.log("静かな夜：次の自分のターン開始時まで、相手は効果でカードを引けない");
              done();
            }
          });
          card("GEN4-002", null, null, {
            event(ctx, done) {
              const opts = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ key: String(n), label: "元のコスト" + n }));
              ctx.pickOption({ title: "コスト宣言", message: "宣言する元のコストを選んでください", options: opts }, (o) => {
                const n = Number(o && o.key || 1);
                Game.addTempEffect({ kind: "playBan", owner: ctx.side, banSide: otherSide(ctx.side), costEq: n, until: nextTurnStartUntil(), note: "コスト宣言：元のコスト" + n + "は使えない" });
                ctx.log("コスト宣言：" + n);
                done();
              });
            }
          });
          card("GEN4-005", null, null, {
            event(ctx, done) {
              ["village", "mansion"].forEach((s) => {
                const p = Game.state.players[s];
                const h = p.hand.slice();
                p.hand = [];
                Game.putOnBottom(s, h, "random");
              });
              ["village", "mansion"].forEach((s) => {
                for (let i = 0; i < 5; i++) {
                  if (Game.state.gameOver) break;
                  Game.drawOne(s, "手札リセット");
                }
              });
              ctx.log("手札リセット：お互いの手札をデッキの下へ→5枚ドロー");
              done();
            }
          });
          card("GEN4-007", null, null, {
            event(ctx, done) {
              ["village", "mansion"].forEach((s) => {
                const p = Game.state.players[s];
                const t = p.trash.slice();
                p.trash = [];
                t.forEach((c) => Game._resetOffField(c));
                Game.putOnBottom(s, t, "random");
              });
              ctx.log("トラッシュリセット：お互いのトラッシュをデッキの下へ");
              done();
            }
          });
          card("GEN4-008", null, null, {
            event(ctx, done) {
              if (!onceGame(ctx, "GEN4-008")) {
                ctx.log("不発：【ゲーム中に1回】使用済み");
                done();
                return;
              }
              ["village", "mansion"].forEach((s) => {
                const p = Game.state.players[s];
                const b = p.energy;
                p.energy = 0;
                Game.state.log.push("気力リセット：" + p.label + " " + b + " → 0");
              });
              done();
            }
          });
          card("GEN4-006", null, null, {
            event(ctx, done) {
              ["village", "mansion"].forEach((s) => Game.state.players[s].youkai.slice().forEach((c) => Game.returnToHand(c, "盤面リセット")));
              ctx.log("盤面リセット：お互いの怪異をすべて手札に戻した");
              done();
            }
          });
        }
        if (missing.length) say("★存在しないID：" + missing.join("、"));
        return { did, missing, B, K, restore() {
          B.restore();
        } };
      }
      module.exports = { patchPoolB, MURA_NEW };
    }
  });

  // src/rules/L09-yuen-v20.js
  var require_L09_yuen_v20 = __commonJS({
    "src/rules/L09-yuen-v20.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var { patchPoolB } = require_L08_pool_b();
      var CLOSE = "YUEN-029";
      var COASTER = "YUEN-036";
      var FIRST_AID = "YUEN-037";
      var HAUNTED = "YUEN-038";
      var MAP = "YUEN-026";
      var CUP = "YUEN-025";
      var MERRY = "YUEN-024";
      var COTTON = "YUEN-023";
      var BLANK = "BLANK:";
      var UNTIL_HAUNTED = "ownAssaultOrNextStart";
      function patchYuenV20(env) {
        const A = env.__poolA;
        if (!A) throw new Error("patch-yuen-v20: patch-pool-a / patch-pool-b を先に当ててください");
        const K = A.kit;
        const { M, E, Game, otherSide, nameOf, setHook, setText, addMaster, pickOppTarget, pickOwnTarget, pump, ownAssaultUntil, toDeckBottom } = K;
        const OBAKE_LITERAL = String(CONFIG.YUEN_V20_OBAKE || "") === "oppturn";
        const undo = [], did = [];
        const say = (s) => did.push(s);
        const units = (p) => p.humans.concat(p.youkai);
        const bothUnits = (st) => units(st.players.village).concat(units(st.players.mansion));
        const findUnitByUid = (st, uid) => bothUnits(st).find((u) => u.uid === uid) || null;
        const onField = (st, inst) => {
          const p = st.players[inst.owner];
          return p.humans.indexOf(inst) !== -1 || p.youkai.indexOf(inst) !== -1;
        };
        const def = (id) => E.definitions[id];
        const trashLocked = (st) => bothUnits(st).some((u) => {
          const d = def(u.cardId);
          return d && d.trashLock;
        });
        function trashToDeckBottom(side, card, why) {
          const st = Game.state, p = st.players[side];
          const i = p.trash.indexOf(card);
          if (i === -1) return false;
          p.trash.splice(i, 1);
          p.deck.push(card);
          st.log.push("移動：" + p.label + " " + nameOf(card) + " トラッシュ → デッキの下（" + why + "）");
          return true;
        }
        function wrap(obj, name, make) {
          const orig = obj[name];
          obj[name] = make(orig);
          undo.push(() => {
            obj[name] = orig;
          });
        }
        if (M[CLOSE]) {
          const saved = M[CLOSE];
          delete M[CLOSE];
          undo.push(() => {
            M[CLOSE] = saved;
          });
          say("★閉園時間（" + CLOSE + "）を CSV から削除（依頼 1-1）");
        }
        setText(MAP, "【1ターン1枚】相手のデッキの上から1枚を見る");
        setHook(MAP, "event", function(ctx, done) {
          ctx.log("案内図：相手のデッキの上から1枚を見た" + (ctx.opponent.deck.length ? "" : "（相手のデッキは空）"));
          done();
        }, "案内図 → 相手のデッキの上から1枚を見る");
        setText(CUP, "【1ターン1枚】相手のトラッシュのカード1枚を選び、相手のデッキの下に置く");
        setHook(CUP, "event", function(ctx, done) {
          if (trashLocked(ctx.state)) {
            ctx.log("不発：トラッシュがロックされている（コーヒーカップ）");
            done();
            return;
          }
          const cands = ctx.opponent.trash.slice();
          if (!cands.length) {
            ctx.log("不発：相手のトラッシュが空（コーヒーカップ）");
            done();
            return;
          }
          ctx.pickCards({ title: "コーヒーカップ", message: "相手のデッキの下に置く、相手のトラッシュのカードを選んでください", cards: cands, count: 1, mode: "exact" }, (ch) => {
            const c = ch && ch[0];
            if (c) trashToDeckBottom(otherSide(ctx.side), c, "コーヒーカップ");
            done();
          });
        }, "コーヒーカップ → 相手のトラッシュ1枚を相手のデッキの下へ");
        setText(MERRY, "【1ターン1枚】自分のトラッシュのカード1枚を選び、自分のデッキの下に置く");
        setHook(MERRY, "event", function(ctx, done) {
          if (trashLocked(ctx.state)) {
            ctx.log("不発：トラッシュがロックされている（メリーゴーラウンド）");
            done();
            return;
          }
          const cands = ctx.me.trash.slice();
          if (!cands.length) {
            ctx.log("不発：自分のトラッシュが空（メリーゴーラウンド）");
            done();
            return;
          }
          ctx.pickCards({ title: "メリーゴーラウンド", message: "自分のデッキの下に置く、自分のトラッシュのカードを選んでください", cards: cands, count: 1, mode: "exact" }, (ch) => {
            const c = ch && ch[0];
            if (c) trashToDeckBottom(ctx.side, c, "メリーゴーラウンド");
            done();
          });
        }, "メリーゴーラウンド → 自分のトラッシュ1枚を自分のデッキの下へ（強制）");
        setText(COTTON, "【1ターン1枚】自分の人間1枚が受けているダメージを1取り除く");
        setHook(COTTON, "event", function(ctx, done) {
          const cands = ctx.me.humans.filter((h) => (h.accumulatedDamage || 0) > 0);
          if (!cands.length) {
            ctx.log("不発：ダメージを受けている人間がいない（綿あめ）");
            done();
            return;
          }
          pickOwnTarget(ctx, cands, "綿あめ", "ダメージを1取り除く人間", done, (t) => {
            Game.healDamage(t, 1);
            done();
          });
        }, "綿あめ → 自分の人間1枚のダメージを1取り除く");
        const newEvent = (id, name, effect, once) => {
          addMaster(id, {
            id,
            name,
            faction: "YUEN",
            deck: "遊園地",
            pool: "base",
            type: "event",
            cost: 3,
            traits: ["遊園地"],
            attribute: null,
            attributeProvisional: false,
            effect,
            baseCount: null,
            oncePerTurnName: !!once
          });
          if (M[id].effect !== effect) setText(id, effect);
        };
        newEvent(COASTER, "ジェットコースター", "自分の怪異1枚を選ぶ。次の自分の襲撃時、そのカードのスピードを+3する。その襲撃の後、そのカードを自分のデッキの下に置く", false);
        setHook(COASTER, "event", function(ctx, done) {
          pickOwnTarget(ctx, ctx.me.youkai.slice(), "ジェットコースター", "スピード+3する怪異", done, (t) => {
            pump(ctx, t, 3, 0, ownAssaultUntil(), "ジェットコースター");
            const st = ctx.state;
            st.__coaster = (st.__coaster || []).concat([{ side: ctx.side, uid: t.uid }]);
            done();
          });
        }, "★新規 ジェットコースター");
        wrap(Game, "finishAttack", (orig) => function(info) {
          const r = orig.apply(this, arguments);
          const st = this.state;
          if (!st.gameOver && st.__coaster && st.__coaster.some((m) => m.side === info.side)) st.__coasterDue = info.side;
          return r;
        });
        function runCoaster(st, side) {
          if (st.__coasterDue !== side) return;
          st.__coasterDue = null;
          const mine = (st.__coaster || []).filter((m) => m.side === side);
          st.__coaster = (st.__coaster || []).filter((m) => m.side !== side);
          mine.forEach((m) => {
            const y = findUnitByUid(st, m.uid);
            if (y && y.owner === side && st.players[side].youkai.indexOf(y) !== -1) toDeckBottom(y, "ジェットコースター");
          });
        }
        wrap(Game, "queueStartTurnEffects", (orig) => function(side) {
          if (this.state && !this.state.gameOver) runCoaster(this.state, side);
          return orig.apply(this, arguments);
        });
        wrap(Game, "turnStartResources", (orig) => function(side) {
          if (this.state && !this.state.gameOver) runCoaster(this.state, side);
          return orig.apply(this, arguments);
        });
        newEvent(FIRST_AID, "救護室", "【1ターン1枚】自分の人間すべてが受けているダメージを2取り除く", true);
        setHook(FIRST_AID, "event", function(ctx, done) {
          const hurt = ctx.me.humans.filter((h) => (h.accumulatedDamage || 0) > 0);
          hurt.forEach((h) => Game.healDamage(h, 2));
          ctx.log("救護室：" + (hurt.length ? hurt.map(nameOf).join("、") + " のダメージを2取り除いた" : "不発（ダメージを受けている人間がいない）"));
          done();
        }, "★新規 救護室");
        const hauntedText = OBAKE_LITERAL ? "相手の人間1枚を選ぶ。次の相手のターン終了時まで、そのカードは効果を失い、スピードを-2する" : "相手の人間1枚を選ぶ。次の自分の襲撃が終わるまで、そのカードは効果を失い、スピードを-2する";
        const hauntedUntil = () => OBAKE_LITERAL ? { type: "oppTurnEnd" } : { type: UNTIL_HAUNTED };
        newEvent(HAUNTED, "お化け屋敷", hauntedText, false);
        function ensureBlankMaster(origId) {
          const bid = BLANK + origId;
          if (!M[bid]) {
            const o = M[origId];
            M[bid] = Object.assign({}, o, { id: bid, effect: "", pool: "removed", faceOnly: true, oncePerTurnName: false, __blankOf: origId });
          }
          return M[bid];
        }
        const isBlank = (inst) => !!(inst && inst.__blankOrig);
        function applyBlank(inst) {
          if (!inst || isBlank(inst)) return;
          const origId = inst.cardId;
          const bm = ensureBlankMaster(origId);
          inst.__blankOrig = origId;
          inst.cardId = bm.id;
          inst.master = bm;
        }
        function unblank(inst) {
          if (!isBlank(inst)) return;
          const origId = inst.__blankOrig;
          inst.cardId = origId;
          inst.master = M[origId];
          delete inst.__blankOrig;
        }
        function maybeUnblank(st, uid) {
          if (st.tempEffects.some((e) => e.kind === "loseEffects" && e.targetUid === uid)) return;
          const inst = findUnitByUid(st, uid);
          if (inst) unblank(inst);
        }
        setHook(HAUNTED, "event", function(ctx, done) {
          pickOppTarget(ctx, ctx.opponent.humans.slice(), "お化け屋敷", "効果を失わせる相手の人間", done, (t) => {
            const until = hauntedUntil();
            Game.addTempEffect({ kind: "loseEffects", owner: ctx.side, target: { uid: t.uid }, targetUid: t.uid, until, __haunted: true, note: "お化け屋敷：効果を失う" });
            Game.addTempEffect({ kind: "stat", owner: ctx.side, target: { uid: t.uid }, targetUid: t.uid, speed: -2, hp: 0, until, __haunted: true, note: "お化け屋敷：スピード-2" });
            applyBlank(t);
            ctx.log("お化け屋敷：" + nameOf(t) + " は効果を失い、スピード-2（" + (OBAKE_LITERAL ? "次の相手のターン終了時まで" : "次の自分の襲撃が終わるまで") + "）");
            Game.recalcAndResolveDeaths("お化け屋敷");
            done();
          });
        }, "★新規 お化け屋敷（効果を失う）");
        wrap(Game, "_expireEffects", (orig) => function(event, side) {
          const st = this.state;
          if (!st.tempEffects.length) return orig.apply(this, arguments);
          const custom = st.tempEffects.filter((e) => e.until && e.until.type === UNTIL_HAUNTED && e.owner === side && (event === "ownAssaultEnd" || event === "beforeStartEffects"));
          if (custom.length) st.tempEffects = st.tempEffects.filter((e) => custom.indexOf(e) === -1);
          const loseBefore = st.tempEffects.filter((e) => e.kind === "loseEffects");
          const r = orig.apply(this, arguments);
          const gone = custom.filter((e) => e.kind === "loseEffects").concat(loseBefore.filter((e) => st.tempEffects.indexOf(e) === -1));
          gone.forEach((e) => maybeUnblank(st, e.targetUid));
          return r;
        });
        wrap(Game, "_leaveField", (orig) => function(inst) {
          const st = this.state;
          const wasBlank = isBlank(inst);
          const r = orig.apply(this, arguments);
          if (inst && !onField(st, inst)) {
            if (wasBlank) {
              st.tempEffects = st.tempEffects.filter((e) => !(e.__haunted && e.targetUid === inst.uid));
              unblank(inst);
            }
            if (st.__coaster && st.__coaster.length) st.__coaster = st.__coaster.filter((m) => m.uid !== inst.uid);
          }
          return r;
        });
        wrap(E, "_react", (orig) => function(state, side, source) {
          if (isBlank(source)) return;
          return orig.apply(this, arguments);
        });
        say("★新規 " + COASTER + " ジェットコースター／" + FIRST_AID + " 救護室／" + HAUNTED + " お化け屋敷（期間：" + (OBAKE_LITERAL ? "依頼の文面どおり" : "次の自分の襲撃が終わるまで") + "）");
        say("1コスト4枚の差し替え：案内図・コーヒーカップ・メリーゴーラウンド・綿あめ");
        const out = {
          did,
          OBAKE_LITERAL,
          isBlank,
          applyBlank,
          unblank,
          restore() {
            undo.slice().reverse().forEach((f) => {
              try {
                f();
              } catch (e) {
              }
            });
            Object.keys(M).forEach((id) => {
              if (id.indexOf(BLANK) === 0) delete M[id];
            });
          }
        };
        env.__yuenV20 = out;
        return out;
      }
      module.exports = { patchYuenV20, CLOSE, COASTER, FIRST_AID, HAUNTED };
    }
  });

  // src/rules/L10-r27.js
  var require_L10_r27 = __commonJS({
    "src/rules/L10-r27.js"(exports, module) {
      "use strict";
      var CONFIG = require_config_r28();
      var COST_DOWN = "YUEN-039";
      var RESET = "YORU-028";
      var REMOVE2 = "GEN5-001";
      var DMG3 = "GEN5-002";
      var REPL = "GEN5-003";
      var LOOKER = "YORU-023";
      var PARADE = "YUEN-009";
      var SORA = "YUEN-005";
      var ZOMBIE = "YUEN-020";
      var HANABI = "YUEN-028";
      var UCHIAGE_HANABI = "YUEN-032";
      var UCHIAGE = "YUEN-034";
      var PHOTO = "YUEN-027";
      var COASTER = "YUEN-036";
      var B_GOODS = "COMMON-002";
      var G6 = "COMMON-007";
      var MANAGER = "HOTEL-008";
      var GIANTS_TARGET = { "CHIKA-004": 5, "CHIKA-010": 6, "CHIKA-011": 6, "CHIKA-022": 6 };
      var REMOVED_PHASE2 = [
        "MORI-010",
        "MORI-012",
        "MORI-024",
        "SHIMA-024",
        "SHIMA-016",
        "SHIMA-021",
        "SHIMA-023",
        "HOTEL-022",
        "HOTEL-023",
        "SHOTEN-017",
        "GEN2-019",
        "GAKKO-017",
        "DANCHI-022",
        "DANCHI-010",
        "YORU-012",
        "GEN4-009"
      ];
      var REMOVED_R27 = ["GEN2-017", "GEN3-001", "GEN3-002", "GEN2-006", "COMMON-001", "COMMON-003", "GEN4-010", COASTER];
      var KEEP_ORIGINAL_COST = ["MORI-004", "GEN2-003", "GEN4-002"];
      function patchR27(env) {
        const A = env.__poolA;
        if (!A) throw new Error("patch-r27: patch-pool-a / pool-b / yuen-v20 を先に当ててください");
        if (!env.__yuenV20) throw new Error("patch-r27: patch-yuen-v20 を先に当ててください");
        const K = A.kit;
        const {
          M,
          E,
          Game,
          hasTrait,
          originalCost,
          otherSide,
          nameOf,
          setHook,
          defineCard,
          setText,
          setStats,
          setPool,
          setDeckName,
          setEquip,
          addMaster,
          pickOppTarget,
          pickOwnTarget,
          drawN,
          pump,
          dmg,
          discardOwnChoice,
          toDeckBottom,
          selfStat,
          useEventFromTrash
        } = K;
        const undo = [], did = [];
        const say = (s) => did.push(s);
        const wrap = (obj, name, make) => {
          const orig = obj[name];
          obj[name] = make(orig);
          undo.push(() => {
            obj[name] = orig;
          });
        };
        const setField = (id, key, val) => {
          const m = M[id];
          if (!m) throw new Error("patch-r27: " + id + " が無い");
          const had = Object.prototype.hasOwnProperty.call(m, key), old = m[key];
          m[key] = val;
          undo.push(() => {
            if (had) m[key] = old;
            else delete m[key];
          });
        };
        const need = (id) => {
          if (!M[id]) throw new Error("patch-r27: " + id + " が無い");
          return M[id];
        };
        const units = (p) => p.humans.concat(p.youkai);
        const onField = (st, inst) => {
          const p = st.players[inst.owner];
          return p.humans.indexOf(inst) !== -1 || p.youkai.indexOf(inst) !== -1;
        };
        const yuenField = (ctx) => hasTrait(ctx.me.field, "遊園地");
        const yuenEvent = (c) => c.master.type === "event" && hasTrait(c, "遊園地");
        const costOf = (inst) => originalCost(inst);
        const costDown = (st, side) => st.__costDown && st.__costDown.t === st.turnCount ? st.__costDown[side] || 0 : 0;
        const onceUsed = (side, c) => !!(c.master.oncePerTurnName && Game.state.players[side].turnUse.eventsByName[nameOf(c)]);
        wrap(Game, "_useEvent", (orig) => function(side, inst, o) {
          const oo = Object.assign({}, o || {});
          if (inst && inst.master && inst.master.oncePerTurnName) {
            if (oo.from === "trash" && this.state.players[side].turnUse.eventsByName[nameOf(inst)]) {
              this.state.log.push("不発：【1ターン1枚】同名のイベントはこのターン使用済み（" + nameOf(inst) + "）");
              return;
            }
            oo.ignoreOnce = false;
          }
          return orig.call(this, side, inst, oo);
        });
        function onceFilter(side, cards) {
          const seen = {};
          return cards.filter((c) => {
            if (onceUsed(side, c)) return false;
            if (!c.master.oncePerTurnName) return true;
            const k = nameOf(c);
            if (seen[k]) return false;
            seen[k] = 1;
            return true;
          });
        }
        const PARADE_MIN = Number(CONFIG.YUEN_PARADE_MIN || 2) | 0;
        setHook(PARADE, "enter", function(ctx, done) {
          const st = ctx.state;
          const all = ctx.me.trash.filter((c) => yuenEvent(c) && costOf(c) >= PARADE_MIN);
          const cands = onceFilter(ctx.side, all);
          if (!cands.length) {
            ctx.log("不発：トラッシュに使えるコスト" + PARADE_MIN + "以上の〔遊園地〕イベントがない");
            done();
            return;
          }
          ctx.pickCards({ title: "パレード", message: "トラッシュから使う〔遊園地〕イベント（コスト" + PARADE_MIN + "以上・【1ターン1枚】は同名1枚まで）を好きな枚数選んでください", cards: cands, count: cands.length, mode: "max" }, (ch) => {
            const list = onceFilter(ctx.side, (ch || []).slice());
            if (!list.length) {
              done();
              return;
            }
            const fire = (ordered) => {
              st.__paradeReturn = st.__paradeReturn || [];
              st.__paradeReturn.push({ side: ctx.side, cards: ordered.slice(), remaining: ordered.length });
              ordered.forEach((ev) => {
                Game._useEvent(ctx.side, ev, { from: "trash", cost: 0, after: "stay", fixedOrder: true });
              });
              done();
            };
            if (list.length > 1) ctx.pickOrder({ title: "パレード", message: "解決する順番を選んでください", items: list }, (o) => fire(o && o.length === list.length ? o : list));
            else fire(list);
          });
        });
        setHook(SORA, "enter", function(ctx, done) {
          const cands = onceFilter(ctx.side, ctx.me.trash.filter((c) => yuenEvent(c) && costOf(c) <= 1));
          if (!cands.length) {
            ctx.log("不発：トラッシュに使えるコスト1以下の〔遊園地〕イベントがない（ソラ）");
            done();
            return;
          }
          ctx.pickCards({ title: "ソラ", message: "トラッシュから使う〔遊園地〕イベント（コスト1以下）を1枚選んでください", cards: cands, count: 1, mode: "exact" }, (ch) => {
            if (ch && ch.length) Game._useEvent(ctx.side, ch[0], { from: "trash", cost: 0, after: "stay" });
            done();
          });
        });
        setHook(ZOMBIE, "enter", function(ctx, done) {
          const cands = onceFilter(ctx.side, ctx.me.trash.filter((c) => yuenEvent(c) && costOf(c) <= 2));
          if (!cands.length) {
            ctx.log("不発：トラッシュに使えるコスト2以下の〔遊園地〕イベントがない（動物ゾンビ）");
            done();
            return;
          }
          ctx.pickCards(
            { title: "動物ゾンビ（獣）", message: "コストを支払わずに使うイベントを1枚選んでください", cards: cands, count: 1, mode: "exact" },
            (ch) => {
              const ev = ch && ch[0];
              if (!ev) {
                done();
                return;
              }
              useEventFromTrash(ctx, ev, "stay", false, done);
            }
          );
        });
        say("A1 【1ターン1枚】を効果での使用（パレード・ソラ・動物ゾンビ）にもかけた");
        const effStack = [];
        let ruleDepth = 0;
        wrap(Game, "runEffect", (orig) => function(item, uiOps, done) {
          effStack.push(item ? item.side : null);
          let popped = false;
          const pop = () => {
            if (!popped) {
              popped = true;
              effStack.pop();
            }
          };
          try {
            return orig.call(this, item, uiOps, function() {
              pop();
              if (done) return done.apply(this, arguments);
            });
          } finally {
            pop();
          }
        });
        wrap(Game, "recalcAndResolveDeaths", (orig) => function() {
          ruleDepth++;
          try {
            return orig.apply(this, arguments);
          } finally {
            ruleDepth--;
          }
        });
        wrap(Game, "finishAttack", (orig) => function() {
          ruleDepth++;
          try {
            return orig.apply(this, arguments);
          } finally {
            ruleDepth--;
          }
        });
        wrap(Game, "_leaveField", (orig) => function(inst, dest, why) {
          const st = this.state;
          if (!ruleDepth && inst && st && onField(st, inst) && (inst.equipment || []).length) {
            const effSide = effStack.length ? effStack[effStack.length - 1] : null;
            if (effSide && effSide !== inst.owner) {
              const g = inst.equipment.find((x) => x.cardId === REPL);
              if (g) {
                this._detachGoods(inst, g);
                st.players[g.owner].trash.push(g);
                st.log.push("置換：" + nameOf(inst) + " は場を離れず、代わりに " + nameOf(g) + " をトラッシュに置いた（" + (why || "相手の効果") + "）");
                this.queueEffect("leave", g);
                return;
              }
            }
          }
          return orig.apply(this, arguments);
        });
        say("A3 置換グッズ：相手の効果で場を離れる時だけ置き換え（体力0・襲撃による死亡は置き換えない）");
        setField(HANABI, "oncePerTurnName", false);
        setText(HANABI, "自分のフィールドが特徴〔遊園地〕を持つなら、相手のコスト3以下の怪異1枚に2ダメージを与える");
        setHook(HANABI, "event", function(ctx, done) {
          if (!yuenField(ctx)) {
            ctx.log("不発：フィールドが〔遊園地〕ではない（花火）");
            done();
            return;
          }
          const lim = 3 + costDown(ctx.state, ctx.side);
          pickOppTarget(ctx, ctx.opponent.youkai.filter((c) => costOf(c) <= lim), "花火", "2ダメージを与える怪異（コスト" + lim + "以下として見る）", done, (t) => {
            dmg(ctx, t, 2);
            done();
          });
        });
        setText(UCHIAGE_HANABI, "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手のコスト2以下の怪異すべてに1ダメージを与える");
        setHook(UCHIAGE_HANABI, "event", function(ctx, done) {
          if (!yuenField(ctx)) {
            ctx.log("不発：フィールドが〔遊園地〕ではない（打ち上げ花火）");
            done();
            return;
          }
          const lim = 2 + costDown(ctx.state, ctx.side);
          const list = ctx.opponent.youkai.filter((c) => costOf(c) <= lim);
          if (!list.length) ctx.log("不発：相手のコスト" + lim + "以下の怪異がいない（打ち上げ花火）");
          list.forEach((c) => dmg(ctx, c, 1));
          done();
        });
        addMaster(COST_DOWN, {
          id: COST_DOWN,
          name: "コスト下げ（仮名）",
          faction: "YUEN",
          deck: "遊園地",
          pool: "pool",
          type: "event",
          cost: 3,
          traits: ["遊園地"],
          attribute: null,
          attributeProvisional: false,
          effect: "このターン、自分の特徴〔遊園地〕を持つイベントの効果は、相手の怪異のコストを3低いものとして扱う",
          baseCount: null,
          oncePerTurnName: false
        });
        setHook(COST_DOWN, "event", function(ctx, done) {
          const st = ctx.state;
          const cur = st.__costDown && st.__costDown.t === st.turnCount ? st.__costDown : { t: st.turnCount, village: 0, mansion: 0 };
          const next = { t: cur.t, village: cur.village, mansion: cur.mansion };
          next[ctx.side] += 3;
          st.__costDown = next;
          ctx.log("コスト下げ：このターン、自分の〔遊園地〕イベントの効果は相手の怪異のコストを" + next[ctx.side] + "低く見る");
          done();
        });
        setField(UCHIAGE, "oncePerTurnName", false);
        setText(UCHIAGE, "自分の特徴〔遊園地〕を持つ怪異すべては、次の襲撃時にスピードを+2する");
        setText(PHOTO, "【1ターン1枚】自分の手札1枚を捨てる。そうしたなら、自分は1枚ドローする");
        setHook(PHOTO, "event", function(ctx, done) {
          discardOwnChoice(ctx, 1, (moved) => {
            if (moved && moved.length && !ctx.isOver()) drawN(ctx, 1);
            else if (!moved || !moved.length) ctx.log("写真館：手札が無いのでドローしない");
            done();
          }, "写真館");
        });
        ["GEN2-014", "GEN3-008"].forEach((id) => {
          need(id);
          setDeckName(id, "遊園地", "YUEN");
          setField(id, "generic", false);
          setPool(id, "pool");
          if (!(M[id].traits || []).includes("遊園地")) setField(id, "traits", (M[id].traits || []).concat(["遊園地"]));
        });
        say("B 遊園地：花火（1枚に2点・コスト3以下・LIMITEDなし）／打ち上げ花火（コスト2以下すべてに1点）／コスト下げ新規／打ち上げLIMITEDなし／写真館 捨て→ドロー／ロック2種を遊園地へ");
        const toTrash = (t, why) => Game._leaveField(t, "trash", why);
        setStats("GEN2-015", 1, null, null);
        setText("GEN2-015", "【1ターン1枚】相手のコスト1以下の怪異1枚を選び、トラッシュに置く");
        defineCard("GEN2-015", { event(ctx, done) {
          pickOppTarget(ctx, ctx.opponent.youkai.filter((c) => costOf(c) <= 1), "業火・小", "トラッシュに置く怪異（コスト1以下）", done, (t) => {
            toTrash(t, "業火・小");
            done();
          });
        } });
        setText("GEN2-016", "【1ターン1枚】相手のコスト1以下の怪異すべてを、相手の手札に戻す");
        defineCard("GEN2-016", { event(ctx, done) {
          const list = ctx.opponent.youkai.filter((c) => costOf(c) <= 1);
          if (!list.length) ctx.log("不発：相手のコスト1以下の怪異がいない（業火・戻し）");
          list.forEach((t) => {
            if (onField(ctx.state, t)) Game.returnToHand(t, "業火・戻し");
          });
          done();
        } });
        addMaster(REMOVE2, {
          id: REMOVE2,
          name: "除去2（新規a・仮名）",
          faction: "GEN5",
          deck: "共通",
          pool: "generic",
          generic: true,
          type: "event",
          cost: 2,
          traits: [],
          attribute: null,
          attributeProvisional: false,
          oncePerTurnName: true,
          baseCount: null,
          effect: "【1ターン1枚】相手のコスト2以下の怪異1枚を選び、トラッシュに置く"
        });
        defineCard(REMOVE2, { event(ctx, done) {
          pickOppTarget(ctx, ctx.opponent.youkai.filter((c) => costOf(c) <= 2), "除去2", "トラッシュに置く怪異（コスト2以下）", done, (t) => {
            toTrash(t, "除去2");
            done();
          });
        } });
        addMaster(DMG3, {
          id: DMG3,
          name: "除去3（新規b・仮名）",
          faction: "GEN5",
          deck: "共通",
          pool: "generic",
          generic: true,
          type: "event",
          cost: 3,
          traits: [],
          attribute: null,
          attributeProvisional: false,
          oncePerTurnName: true,
          baseCount: null,
          effect: "【1ターン1枚】相手の怪異1枚に3ダメージを与える"
        });
        defineCard(DMG3, { event(ctx, done) {
          pickOppTarget(ctx, ctx.opponent.youkai, "除去3", "3ダメージを与える怪異", done, (t) => {
            dmg(ctx, t, 3);
            done();
          });
        } });
        setStats("COMMON-004", 4, null, null);
        setStats("GEN2-018", 5, null, null);
        setText("GEN2-018", "【1ターン1枚】相手のコスト8以下の怪異を2枚まで選び、相手のデッキの下に置く");
        defineCard("GEN2-018", { event(ctx, done) {
          const list = ctx.targetable(ctx.opponent.youkai.filter((c) => costOf(c) <= 8));
          if (!list.length) {
            ctx.log("不発：対象がいない（業火・二体）");
            done();
            return;
          }
          ctx.pickCards({ title: "業火・二体", message: "デッキの下に置く怪異（コスト8以下）を2枚まで選んでください", cards: list, count: Math.min(2, list.length), mode: "max" }, (ch) => {
            (ch || []).forEach((t) => {
              if (onField(ctx.state, t)) toDeckBottom(t, "業火・二体");
            });
            done();
          });
        } });
        setText("GAKKO-019", "【登場時】自分のフィールドが特徴〔学校〕を持つなら、相手のコスト2以下の怪異1枚をトラッシュに置く");
        defineCard("GAKKO-019", { enter(ctx, done) {
          if (!hasTrait(ctx.me.field, "学校")) {
            ctx.log("不発：フィールドが〔学校〕ではない（学人5）");
            done();
            return;
          }
          pickOppTarget(ctx, ctx.opponent.youkai.filter((c) => costOf(c) <= 2), "学人5", "トラッシュに置く怪異（コスト2以下）", done, (t) => {
            toTrash(t, "学人5");
            done();
          });
        } });
        say("C 除去の階段：業火・小 1c／業火・戻し 1以下すべて手札へ／除去2 新規／除去3 新規／確定除去 4c／業火・二体 5c 8以下／学人5 2以下");
        addMaster(REPL, {
          id: REPL,
          name: "置換グッズ（仮名）",
          faction: "GEN5",
          deck: "共通",
          pool: "generic",
          generic: true,
          type: "goods",
          cost: 0,
          traits: [],
          attribute: null,
          attributeProvisional: false,
          baseCount: null,
          effect: "装備できる相手：人間/怪異。このカードを装備しているカードが相手の効果によって場を離れる時、代わりにこのカードをトラッシュに置く",
          equipBonus: {},
          equipTarget: { type: "any", trait: null, name: null }
        });
        defineCard(REPL, {});
        setText(B_GOODS, "装備できる相手：人間/怪異。このカードを装備しているカードは、相手の効果によって選ばれない");
        setEquip(B_GOODS, { type: "any", trait: null, name: null }, {});
        need(G6);
        setDeckName(G6, "共通", "COMMON");
        setField(G6, "traits", []);
        setField(G6, "generic", true);
        setPool(G6, "generic");
        setText(G6, "装備できる相手：怪異。スピード+1");
        say("D 置換グッズ新規／B（汎G2）＝人間/怪異・選ばれない／汎G6 を汎用に");
        REMOVED_PHASE2.concat(REMOVED_R27).forEach((id) => {
          need(id);
          setPool(id, "removed");
        });
        say("E 削除：フェーズ2の16枚＋R27の8枚を pool=removed");
        let nText = 0;
        Object.keys(M).forEach((id) => {
          const m = M[id];
          if (!m || typeof m.effect !== "string" || KEEP_ORIGINAL_COST.indexOf(id) !== -1) return;
          if (m.effect.indexOf("元のコスト") === -1 && m.effect.indexOf("元コスト") === -1) return;
          setText(id, m.effect.replace(/元のコスト/g, "コスト").replace(/元コスト/g, "コスト"));
          nText++;
        });
        say("F 表記：「元のコスト」→「コスト」" + nText + "枚（ルピア・大型課税・コスト宣言は残す）");
        const TH = 3;
        setText("FIELD-YORU", "相手の手札が3枚以下なら、自分の特徴〔夜の街〕を持つ怪異は、相手の人間から受けるダメージを1軽減し、相手の効果によって選ばれない。");
        setHook("FIELD-YORU", "targetImmunityFor", function(c, st) {
          const p = st.players[c.owner];
          if (st.players[otherSide(c.owner)].hand.length > TH) return false;
          return c.master.type === "youkai" && hasTrait(c, "夜の街") && p.field.cardId === "FIELD-YORU";
        });
        setStats("YORU-004", null, 3, 4);
        setStats("YORU-005", 2, 2, 4);
        setText("YORU-005", "【登場時】自分のフィールドが特徴〔夜の街〕を持つなら、相手の手札からランダムに1枚を捨てる");
        defineCard("YORU-005", { enter(ctx, done) {
          if (!hasTrait(ctx.me.field, "夜の街")) {
            ctx.log("不発：フィールドが〔夜の街〕ではない（街人4）");
            done();
            return;
          }
          Game.discardRandomFromHand(otherSide(ctx.side), 1, "街人4");
          done();
        } });
        setStats(LOOKER, 4, 3, 5);
        setText(LOOKER, "相手が1ターンに2枚目以降のカードを引くたび、相手は自分の手札1枚を捨てる／自分のフィールドが特徴〔夜の街〕を持ち、相手の手札が3枚以下なら、このカードのスピードと体力を+2する");
        defineCard(LOOKER, {
          static: selfStat((src, st) => hasTrait(st.players[src.owner].field, "夜の街") && st.players[otherSide(src.owner)].hand.length <= TH ? { speed: 2, hp: 2 } : null, "見下ろすもの"),
          react: {
            oppDrewExtra(ctx, done) {
              const opp = otherSide(ctx.side), hand = ctx.opponent.hand.slice();
              if (!hand.length) {
                ctx.log("見下ろすもの：相手の手札が無い");
                done();
                return;
              }
              ctx.oppOps().pickCards(
                { title: "見下ろすもの（相手の効果）", message: "トラッシュへ置く手札を1枚選んでください", cards: hand, count: 1, mode: "exact" },
                (chosen) => {
                  Game.discardFromHand(opp, chosen || [], "見下ろすもの");
                  done();
                }
              );
            }
          }
        });
        wrap(Game, "drawOne", (orig) => function(side) {
          const card = orig.apply(this, arguments);
          const st = this.state;
          if (card && st && !st.gameOver) {
            const t = st.turnCount;
            const cur = st.__drawCnt && st.__drawCnt.t === t ? st.__drawCnt : { t, village: 0, mansion: 0 };
            const next = { t, village: cur.village, mansion: cur.mansion };
            next[side] += 1;
            st.__drawCnt = next;
            if (next[side] >= 2) {
              const owner = otherSide(side);
              st.players[owner].youkai.filter((u) => u.cardId === LOOKER).forEach((u) => E._react(st, owner, u, "oppDrewExtra", { drawer: side, n: next[side] }));
            }
          }
          return card;
        });
        addMaster(RESET, {
          id: RESET,
          name: "リセット（仮名）",
          faction: "YORU",
          deck: "夜の街",
          pool: "pool",
          type: "event",
          cost: 1,
          traits: ["夜の街"],
          attribute: null,
          attributeProvisional: false,
          oncePerTurnName: true,
          baseCount: null,
          effect: "【1ターン1枚】お互いのプレイヤーは、自分の手札をすべて好きな順番で自分のデッキの下に置く。その後、それぞれ5枚ドローする"
        });
        defineCard(RESET, { event(ctx, done) {
          const me = ctx.side, op = otherSide(ctx.side), st = ctx.state;
          [me, op].forEach((s) => {
            const p = st.players[s];
            const hand = p.hand.slice();
            if (!hand.length) return;
            hand.forEach((c) => {
              const i = p.hand.indexOf(c);
              if (i !== -1) p.hand.splice(i, 1);
            });
            Game.putOnBottom(s, hand, "choose");
            ctx.log("リセット：" + p.label + " の手札" + hand.length + "枚をデッキの下へ");
          });
          for (const s of [me, op]) {
            for (let i = 0; i < 5; i++) {
              if (ctx.isOver()) break;
              Game.drawOne(s);
            }
          }
          done();
        } });
        say("G 夜の街：フィールド＋選ばれない／街人3 3/4／街人4 2/4ランハン／見下ろすもの 4c3/5 ドロー罰／リセット新規／宵闇削除");
        setText("FIELD-DANCHI", "自分の場に怪異が2枚以上あるなら、自分の特徴〔団地〕を持つコスト1以下の怪異すべてのスピードを+1する。／自分の場に怪異が1枚しかないなら、自分の特徴〔団地〕を持つコスト1以下の怪異の襲撃時、自分の手札1枚を捨てることができる。そうしたなら、この襲撃の間、そのカードのスピードを+1する。");
        wrap(Game, "prepareAttack", (orig) => function(side) {
          const st = this.state, p = st && st.players[side], t = st && st.tracking[side];
          if (t && p && p.field.cardId === "FIELD-DANCHI" && p.youkai.length === 1 && t.youkai === p.youkai[0] && hasTrait(t.youkai, "団地") && costOf(t.youkai) <= 1 && p.hand.length && !st.gameOver) {
            const ops = this._opsFor(side, { source: p.field, kind: "optional" });
            let yes = false;
            ops.confirmYesNo("～ループ団地～", "手札1枚を捨てて、この襲撃の間 " + nameOf(t.youkai) + " のスピードを+1しますか？", (v) => {
              yes = !!v;
            });
            if (yes) {
              let chosen = null;
              ops.pickCards({ title: "～ループ団地～", message: "トラッシュへ置く手札を1枚選んでください", cards: p.hand.slice(), count: 1, mode: "exact" }, (r) => {
                chosen = r;
              });
              const moved = chosen && chosen.length ? this.discardFromHand(side, chosen, "～ループ団地～") : [];
              if (moved.length) {
                this.addTempEffect({ kind: "stat", owner: side, target: { uid: t.youkai.uid }, speed: 1, hp: 0, until: { type: "ownAssault" }, note: "～ループ団地～：この襲撃の間スピード+1", __danchiDiscard: true });
                st.log.push("～ループ団地～：手札を1枚捨てて " + nameOf(t.youkai) + " のスピード+1（この襲撃の間）");
                st.__danchiDisc = (st.__danchiDisc || 0) + 1;
              }
            }
          }
          return orig.apply(this, arguments);
        });
        say("H 団地：フィールド（1体なら手札を捨てて襲撃+1）／団グ1削除／汎G6は汎用へ");
        setText(MANAGER, "自分のフィールドが特徴〔ホテル〕を持つなら、このカードは【二重追跡】を持つ");
        wrap(Game, "hasDoublePursuit", (orig) => function(yk) {
          if (yk && yk.cardId === MANAGER) return hasTrait(this.state.players[yk.owner].field, "ホテル");
          return orig.call(this, yk);
        });
        setText("FIELD-CHIKA", "自分の場に特徴〔巨人〕を持つ怪異があるなら、自分がこのターン初めて使う特徴〔地下〕と特徴〔巨人〕の両方を持つカードのコストを-3する。ただし、コストは1未満にならない。");
        {
          const d = E.definitions["FIELD-CHIKA"];
          if (!d || typeof d.cost !== "function") throw new Error("patch-r27: FIELD-CHIKA の cost フックが無い");
          const oCost = d.cost;
          setHook("FIELD-CHIKA", "cost", function(side, inst, m, st) {
            const r = oCost.apply(this, arguments) || [];
            return r.map((x) => x && x.delta === -2 ? Object.assign({}, x, { delta: -3, note: String(x.note || "").replace("-2", "-3") }) : x);
          });
        }
        Object.entries(GIANTS_TARGET).forEach(([id, c]) => {
          need(id);
          setStats(id, c, null, null);
        });
        say("I 出張対策：支配人の【二重追跡】にフィールド条件／～地下～ -3／巨人4枚コスト+1");
        if (CONFIG.R27_BOILER_SPEED) {
          setStats("HOTEL-009", null, Number(CONFIG.R27_BOILER_SPEED), null);
          say("★ボイラーのスピードを " + CONFIG.R27_BOILER_SPEED + " に（R27_BOILER_SPEED）");
        } else setStats("HOTEL-009", null, 4, null);
        const out = {
          did,
          COST_DOWN,
          RESET,
          REMOVE2,
          DMG3,
          REPL,
          REMOVED: REMOVED_PHASE2.concat(REMOVED_R27),
          effStack,
          costDown,
          restore() {
            undo.slice().reverse().forEach((f) => {
              try {
                f();
              } catch (e) {
              }
            });
          }
        };
        env.__r27 = out;
        return out;
      }
      module.exports = { patchR27, COST_DOWN, RESET, REMOVE2, DMG3, REPL, REMOVED_PHASE2, REMOVED_R27 };
    }
  });

  // src/rules/L11-r28.js
  var require_L11_r28 = __commonJS({
    "src/rules/L11-r28.js"(exports, module) {
      "use strict";
      var HANABI = "YUEN-028";
      var UCHIAGE_HANABI = "YUEN-032";
      var COST_DOWN = "YUEN-039";
      var RESET = "YORU-028";
      var FREEZE = "GEN4-003";
      var GEN6 = [
        /* [ID, コスト, 速, 体]（null は据え置き） */
        ["GEN2-011", 5, 3, 7],
        /* 食らう壁 */
        ["GEN2-003", null, 2, 4],
        /* 大型課税 */
        ["GEN2-008", null, 2, 4],
        /* 反射軽減（常在） */
        ["GEN4-001", null, 2, 4],
        /* 墓地メタの肉体版 */
        ["GEN2-002", 3, 3, 4]
        /* 怪異課税 */
      ];
      function patchR28(env) {
        const A = env.__poolA;
        if (!A || !env.__r27) throw new Error("patch-r28: patch-r27 を先に当ててください");
        const K = A.kit;
        const { M, Game, hasTrait, otherSide, setHook, defineCard, setText, setStats, setPool, pickOppTarget, dmg, loseEnergy, oppTurnEndUntil } = K;
        const did = [];
        const say = (s) => did.push(s);
        const need = (id) => {
          if (!M[id]) throw new Error("patch-r28: " + id + " が無い");
          return M[id];
        };
        const yuenField = (ctx) => hasTrait(ctx.me.field, "遊園地");
        need(HANABI);
        need(UCHIAGE_HANABI);
        need(COST_DOWN);
        setText(HANABI, "自分のフィールドが特徴〔遊園地〕を持つなら、相手の怪異1枚に2ダメージを与える");
        setHook(HANABI, "event", function(ctx, done) {
          if (!yuenField(ctx)) {
            ctx.log("不発：フィールドが〔遊園地〕ではない（花火）");
            done();
            return;
          }
          pickOppTarget(ctx, ctx.opponent.youkai, "花火", "2ダメージを与える怪異", done, (t) => {
            dmg(ctx, t, 2);
            done();
          });
        });
        setText(UCHIAGE_HANABI, "【1ターン1枚】自分のフィールドが特徴〔遊園地〕を持つなら、相手の怪異すべてに1ダメージを与える");
        setHook(UCHIAGE_HANABI, "event", function(ctx, done) {
          if (!yuenField(ctx)) {
            ctx.log("不発：フィールドが〔遊園地〕ではない（打ち上げ花火）");
            done();
            return;
          }
          const list = ctx.opponent.youkai.slice();
          if (!list.length) ctx.log("不発：相手の怪異がいない（打ち上げ花火）");
          list.forEach((c) => dmg(ctx, c, 1));
          done();
        });
        setPool(COST_DOWN, "removed");
        say("1-1 遊園地：花火（相手の怪異1枚に2点・コスト制限なし）／打ち上げ花火（相手の怪異すべてに1点・【1ターン1枚】）／コスト下げ 削除");
        GEN6.forEach(([id, c, s, h]) => {
          need(id);
          setStats(id, c, s, h);
        });
        need(FREEZE);
        setText(FREEZE, "【1ターン1枚】相手の気力を1凍結する。凍結した気力は、次の相手のターン終了時まで使えない");
        defineCard(FREEZE, {
          event(ctx, done) {
            const opp = otherSide(ctx.side);
            const took = loseEnergy(opp, 1, "気力凍結");
            if (took > 0) {
              Game.addTempEffect({ kind: "energyFreeze", owner: ctx.side, banSide: opp, target: null, amount: took, until: oppTurnEndUntil(), note: "気力凍結：" + took });
              ctx.log("気力凍結：相手の気力" + took + "を凍結（次の相手のターン終了時まで）");
            } else ctx.log("不発：相手の気力が0（気力凍結）");
            done();
          }
        });
        say("1-2 反映漏れ：食らう壁 5c 3/7／大型課税 2/4／反射軽減 2/4／墓地メタの肉体版 2/4／怪異課税 3c 3/4／気力凍結 1凍結");
        need(RESET);
        setText(RESET, "【1ターン1枚】お互いのプレイヤーは、自分の手札をすべてランダムな順番で自分のデッキの下に置く。その後、それぞれ置いた枚数ぶんドローする");
        defineCard(RESET, {
          event(ctx, done) {
            const me = ctx.side, op = otherSide(ctx.side), st = ctx.state;
            const put = {};
            [me, op].forEach((s) => {
              const p = st.players[s];
              const hand = p.hand.slice();
              put[s] = hand.length;
              if (!hand.length) return;
              hand.forEach((c) => {
                const i = p.hand.indexOf(c);
                if (i !== -1) p.hand.splice(i, 1);
              });
              Game.putOnBottom(s, hand, "random");
              ctx.log("リセット：" + p.label + " の手札" + hand.length + "枚をデッキの下へ（ランダムな順番）");
            });
            for (const s of [me, op]) {
              for (let i = 0; i < put[s]; i++) {
                if (ctx.isOver()) break;
                Game.drawOne(s);
              }
            }
            done();
          }
        });
        say("1-3 リセット：ランダムな順番でデッキの下へ → 置いた枚数ぶん引く");
        const out = { did, REMOVED_R28: [COST_DOWN] };
        env.__r28 = out;
        return out;
      }
      module.exports = { patchR28, HANABI, UCHIAGE_HANABI, COST_DOWN, RESET, FREEZE, GEN6 };
    }
  });

  // src/rules/L12-v11.js
  var require_L12_v11 = __commonJS({
    "src/rules/L12-v11.js"(exports, module) {
      "use strict";
      function patchV11(env) {
        const { Game, CARD_MASTER: M, GAME_EVENT } = env;
        const E = env.Effects;
        const { hasTrait, otherSide } = env.helpers;
        const MAX_HUMANS = env.constants.MAX_HUMANS;
        const nameOf = (c) => c.master.name;
        const did = [];
        Game._addToHand = function(side, cards, label, reveal) {
          const p = this.state.players[side];
          cards.forEach((c) => {
            this._resetOffField(c);
            p.hand.push(c);
            this._logCard(side, (label || "ドロー") + "：" + p.label + " " + nameOf(c), (label || "ドロー") + "：" + p.label + " 1枚", reveal);
            this.emit(GAME_EVENT.CARD_DRAWN, { side, card: c, label });
          });
          return cards.length;
        };
        Game.isHandFull = function() {
          return false;
        };
        Game.moveTrashToHand = function(side, inst) {
          const p = this.state.players[side];
          const i = p.trash.indexOf(inst);
          if (i === -1) return false;
          p.trash.splice(i, 1);
          this._addToHand(side, [inst], "回収");
          return true;
        };
        env.constants.HAND_LIMIT = Infinity;
        did.push("手札上限の撤廃（あふれ・残す札の選択・加えられない を外す）");
        const bd = E.definitions["HOTEL-010"];
        if (!bd || typeof bd.enter !== "function") throw new Error("L12-v11: バフォメットの enter が無い");
        bd.enter = function(ctx, done) {
          if (!hasTrait(ctx.me.field, "ホテル")) {
            ctx.log("不発：フィールドが〔ホテル〕ではない");
            done();
            return;
          }
          const opp = otherSide(ctx.side), P = ctx.opponent;
          if (P.humans.length >= MAX_HUMANS) {
            ctx.log("不発：相手の人間エリアが上限");
            done();
            return;
          }
          const hand = P.hand.slice();
          const cands = hand.filter((c) => {
            const m = c.faces ? M[c.faces[0]] : c.master;
            if (!m || m.type !== "human") return false;
            const r = Game.canPlay(opp, c, { free: true });
            return r && r.ok;
          });
          if (!cands.length) {
            ctx.log("不発：相手が出せる人間がありません");
            done();
            return;
          }
          Game.recordHandLook(ctx.side, hand);
          ctx.log("バフォメット：相手の手札を見た（" + hand.length + "枚・見た側だけが知る）");
          ctx.pickCards({
            title: nameOf(ctx.source) + "（相手の手札を見る）",
            message: "相手の場にコストを支払わずに出させる人間を1枚選んでください",
            cards: hand,
            selectable: cands,
            count: 1,
            mode: "exact",
            privateView: true
          }, (chosen) => {
            const c = chosen && chosen[0];
            if (!c) {
              done();
              return;
            }
            const r = Game.playUnit(opp, c, { free: true, byEffect: true, controller: ctx.side });
            if (!r.ok) ctx.log("不発：" + r.reasons.join("／"));
            done();
          });
        };
        did.push("バフォメット登場時：相手の手札全体を見せる・見た記録を残す（ご案内と同じ形）");
        env.__v11 = { did };
        return { did };
      }
      module.exports = { patchV11 };
    }
  });

  // src/rules/L13-v12.js
  var require_L13_v12 = __commonJS({
    "src/rules/L13-v12.js"(exports, module) {
      "use strict";
      var TEXTS = [
        ["YAKATA-002", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["DANCHI-004", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["GAKKO-007", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["SHOTEN-009", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["CHIKA-005", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["CHIKA-014", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["CHIKA-023", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["MORI-003", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["MORI-019", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["SHIMA-008", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["SHIMA-009", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["HOTEL-013", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["YUEN-013", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["CHOKOKU-016", "残りをデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["YAKATA-005", "残りをランダムにデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["HOTEL-003", "残りをランダムにデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["MORI-023", "残りをランダムにデッキの下に戻す", "残りをランダムな順番でデッキの下に戻す"],
        ["GEN2-018", "相手のデッキの下に置く", "相手のデッキの下にランダムな順番で置く"],
        ["GEN4-001", "そのカードの持ち主のデッキの下に置く", "そのカードの持ち主のデッキの下にランダムな順番で置く"],
        ["GEN4-005", "自分の手札をすべてデッキの下に置き", "自分の手札をすべてランダムな順番でデッキの下に置き"],
        ["GEN4-007", "すべて持ち主のデッキの下に置く", "すべて持ち主のデッキの下にランダムな順番で置く"],
        /* ★表に無かった1枚（同じ方針で追加）：パレードが撃ち直したイベントを戻す所。v1.6 で「持ち主が並べる」にしていた */
        ["YUEN-009", "こうして使ったイベントは、すべて持ち主のデッキの下に置く（シャッフルしない）", "こうして使ったイベントは、すべてランダムな順番で持ち主のデッキの下に置く（デッキはシャッフルしない）"]
      ];
      function patchV12(env) {
        const { Game, CARD_MASTER: M } = env;
        const E = env.Effects;
        const did = [];
        const oPut = Game.putOnBottom;
        Game.putOnBottom = function(side, cards, mode) {
          return oPut.call(this, side, cards, cards && cards.length > 1 ? "random" : mode);
        };
        ["GEN2-018", "GEN4-001"].forEach((id) => {
          const d = E.definitions[id];
          if (!d) return;
          ["event", "enter"].forEach((k) => {
            if (typeof d[k] !== "function") return;
            const orig = d[k];
            d[k] = function(ctx, done) {
              const op = ctx.pickCards;
              ctx.pickCards = function(opts, cb) {
                return op.call(ctx, opts, (ch) => {
                  if (ch && ch.length > 1) {
                    ch = ch.slice();
                    Game._shuffle("bottom:" + id, ch);
                  }
                  cb(ch);
                });
              };
              return orig.call(this, ctx, done);
            };
          });
        });
        did.push("山札の下は常にランダム（putOnBottom の choose を廃止・業火・二体／墓地メタの肉体版も）");
        Game.takeNextPending = function() {
          const st = this.state;
          if (st.gameOver) {
            st.pendingEffects = [];
            return null;
          }
          let cands = this.pendingOrderCandidates();
          if (!cands.length) return null;
          const pick = cands.reduce((a, b) => a.seq <= b.seq ? a : b);
          const i = st.pendingEffects.indexOf(pick);
          st.pendingEffects.splice(i, 1);
          return pick;
        };
        did.push("効果の解決順：手番→種類の優先度→発生した順（持ち主に選ばせない）");
        TEXTS.forEach(([id, from, to]) => {
          const m = M[id];
          if (!m) throw new Error("L13-v12: カードが無い " + id);
          if (m.effect.indexOf(to) !== -1) return;
          if (m.effect.indexOf(from) === -1) throw new Error("L13-v12: 効果文の一節が見つからない " + id + "「" + from + "」");
          m.effect = m.effect.replace(from, to);
        });
        did.push("効果文：" + TEXTS.length + "枚を「ランダムな順番で」にそろえた");
        env.__v12 = { did, texts: TEXTS };
        return { did };
      }
      module.exports = { patchV12, TEXTS };
    }
  });

  // v010/L14-v010.js
  var require_L14_v010 = __commonJS({
    "v010/L14-v010.js"(exports, module) {
      "use strict";
      function patchV010(env) {
        const Game = env.Game;
        function positionOrder(inst, st) {
          if (!inst || !inst.master) return 600;
          const type = inst.master.type;
          if (type === "field") return 100;
          if (type !== "human" && type !== "youkai") return 600;
          const p = st.players[inst.owner];
          const zone = p ? type === "human" ? p.humans : p.youkai : [];
          const index = Math.max(0, zone.indexOf(inst));
          if (type === "human") return (inst.tracking ? 400 : 200) + index;
          return (inst.tracking ? 500 : 300) + index;
        }
        ["playUnit", "playGoods", "playEvent"].forEach(function(name) {
          const raw = Game[name];
          Game[name] = function(side, inst) {
            const st = this.state;
            const prev = st.__v10playing;
            st.__v10playing = inst ? inst.uid : null;
            try {
              return raw.apply(this, arguments);
            } finally {
              st.__v10playing = prev;
            }
          };
        });
        const oMk = Game._mkItem;
        Game._mkItem = function(kind, inst, side, extra) {
          const it = oMk.call(this, kind, inst, side, extra);
          const st = this.state;
          if (inst && st.__v10playing != null && inst.uid === st.__v10playing) it.pos = -1;
          else it.pos = positionOrder(inst, st);
          return it;
        };
        Game.takeNextPending = function() {
          const st = this.state;
          if (st.gameOver) {
            st.pendingEffects = [];
            return null;
          }
          const list = st.pendingEffects;
          if (!list.length) return null;
          let best = 0;
          for (let i = 1; i < list.length; i++) {
            const a = list[i], b = list[best];
            const ap0 = a.pos === -1 ? 0 : 1, bp0 = b.pos === -1 ? 0 : 1;
            if (ap0 !== bp0) {
              if (ap0 < bp0) best = i;
              continue;
            }
            const at = a.side === st.currentSide ? 0 : 1, bt = b.side === st.currentSide ? 0 : 1;
            if (at !== bt) {
              if (at < bt) best = i;
              continue;
            }
            const ap = a.pos == null ? 600 : a.pos, bp = b.pos == null ? 600 : b.pos;
            if (ap !== bp) {
              if (ap < bp) best = i;
              continue;
            }
            if (a.seq < b.seq) best = i;
          }
          return list.splice(best, 1)[0];
        };
        Game.pendingOrderCandidates = function() {
          return [];
        };
        const oQE = Game.queueEndTurnEffects;
        Game.queueEndTurnEffects = function(side) {
          this.state.__v10endQueued = true;
          return oQE.apply(this, arguments);
        };
        const oET = Game.endTurn;
        Game.endTurn = function() {
          delete this.state.__v10endQueued;
          return oET.apply(this, arguments);
        };
        return { did: ["効果の解決順：使ったカードの効果 → 手番 → 場所の順（仕様書18.2）→ 誘発順", "終了時効果を積んだ印（__v10endQueued）"] };
      }
      module.exports = { patchV010 };
    }
  });

  // v010/rules-entry.js
  var require_rules_entry = __commonJS({
    "v010/rules-entry.js"(exports, module) {
      var { createGd1Engine } = require_engine_gd1();
      var BASE = require_cards_gd1();
      var DECKS_V10 = require_decks_v1_0();
      var { createAiCoreGd1 } = require_ai_core_gd1();
      var { createAgentsGd1 } = require_agents_gd1();
      var { createFairDeterminizerGd1 } = require_fair_determinize_gd1();
      var UNIMPLEMENTED = require_unimplemented();
      var VERSION = "gd1-v1.2";
      var LAYERS = [
        ["L01-mori-v15", () => require_L01_mori_v15().patchMoriV15],
        ["L02-hotelb-v15", () => require_L02_hotelb_v15().patchHotelBV15],
        ["L03-yoru-v15", () => require_L03_yoru_v15().patchYoruV15],
        ["L04-hotela-v15", () => require_L04_hotela_v15().patchHotelAV15],
        ["L05-yuen-v15", () => require_L05_yuen_v15().patchYuenV15],
        ["L06-chika-v15", () => require_L06_chika_v15().patchChikaV15],
        ["L07-pool-a", () => require_L07_pool_a().patchPoolA],
        ["L08-pool-b", () => require_L08_pool_b().patchPoolB],
        ["L09-yuen-v20", () => require_L09_yuen_v20().patchYuenV20],
        ["L10-r27", () => require_L10_r27().patchR27],
        ["L11-r28", () => require_L11_r28().patchR28],
        ["L12-v11", () => require_L12_v11().patchV11],
        ["L13-v12", () => require_L13_v12().patchV12]
      ];
      if (true) {
        LAYERS.push(["L14-v010", () => require_L14_v010().patchV010]);
      }
      function clone(o) {
        return JSON.parse(JSON.stringify(o));
      }
      function createRulesEnv(deps) {
        const CARD_MASTER = clone(BASE.CARD_MASTER_GD1), DECKS = clone(BASE.DECKS_GD1);
        const engine = createGd1Engine({ CARD_MASTER, DECKS, createRng: deps.createRng, GameEvents: deps.GameEvents, GAME_EVENT: deps.GAME_EVENT });
        const env = Object.assign({}, engine, {
          GAME_EVENT: deps.GAME_EVENT,
          GameEvents: deps.GameEvents,
          createRng: deps.createRng,
          GD1_ADOPTED: BASE.GD1_ADOPTED,
          GD1_SOURCE: BASE.GD1_SOURCE
        });
        env.AiCore = createAiCoreGd1(env);
        env.createFairDeterminizer = (e, op) => createFairDeterminizerGd1(e, op);
        const agents = createAgentsGd1(env);
        env.AiUiOps = agents.AiUiOpsGd1;
        env.createRandomAgent = agents.createRandomAgent;
        env.layers = [];
        LAYERS.forEach(([name, get]) => {
          get()(env);
          env.layers.push(name);
        });
        Object.keys(DECKS_V10).forEach((k) => {
          const d = DECKS_V10[k];
          if (env.DECKS[k]) {
            env.DECKS[k].mainDeck = d.mainDeck.map((x) => ({ id: x.id, count: x.count }));
            env.DECKS[k].displayName = d.displayName;
            env.DECKS[k].set = d.set;
          } else env.DECKS[k] = clone(d);
        });
        env.DECK_ORDER = Object.keys(DECKS_V10);
        env.UNIMPLEMENTED = UNIMPLEMENTED.slice();
        env.VERSION = VERSION;
        return env;
      }
      module.exports = { createRulesEnv, VERSION, LAYERS: LAYERS.map((x) => x[0]) };
    }
  });
  return require_rules_entry();
})();
