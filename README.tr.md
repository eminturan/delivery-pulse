# Delivery Pulse

Azure DevOps Server 2022 için teslim hızı panosu: work item'ların **açıldığı andan kapandığı ana kadar geçen süreyi** (lead time) ölçer ve parent'ları, child'ları ayrı ayrı hesaplar.

[English](README.md)

## Ne gösterir

Boards altında **Delivery Pulse** sayfası açılır ve bulunduğunuz projede seçilen tarih aralığında (varsayılan son 90 gün) kapanan work item'ları tek listede gösterir. Her satırda kaydın child sayısı (Child sütunu) ve bağlı olduğu kayıt (Parent sütunu) yer alır; parent, child ve bağımsız kayıtlar bu iki sütundan ayırt edilir.

### Parent'lar bir projede, child'lar başka projelerde

Sayfa parent'ların bulunduğu projeden açıldığında, **parent'ı bu projede olan child'lar hangi projede olurlarsa olsunlar** okunur ve proje adıyla listelenir (ayrıca "Projeye göre" dökümü çıkar). Alt seviyelere de inilir (child'ın child'ı, en fazla 5 seviye). Related ya da Tested By ile bağlı kayıtlar (örn. test kartları) da child gibi izlenir ve Parent sütununda bağlantı türüyle gösterilir. Her child, kendi projesinin kapalı durumlarına göre kapalı sayılır. Child'ları kapanmış ama kendisi henüz kapanmamış parent'lar "Hâlâ açık parent'lar" tablosunda görünür.

Sayfa bir child projesinden açılırsa o projede kapanan kayıtlar gösterilir; parent'ları başka projede olsa da okunur.

Listenin üstünde seçilen aralık için üç sayaç yer alır: aralıkta açılıp kapanan, aralıkta açılıp hâlâ açık olan ve önceden açılıp aralıkta kapanan kayıt sayısı (tür süzgeci bunlara da uygulanır). Bir sayaca tıklandığında ya da "Gösterilen" menüsünden seçildiğinde aşağıda yalnızca o kayıtlar listelenir; istatistikler ve CSV de seçime göre değişir. Hâlâ açık kayıtların kapanış tarihi ve lead time'ı boştur.

Liste için: kapanan adet, medyan / ortalama / 85. yüzdelik lead time, medyan cycle time, haftalık medyan grafiği, türe göre döküm ve sıralanabilir kayıt listesi.

## CSV dışa aktarma

Kayıt listesinin üstündeki **CSV indir** düğmesi, arama ve sıralamadan geçen tüm satırları indirir; yalnızca ekranda görünen ilk 100 satırı değil. Türkçe arayüzde ayırıcı `;` ve ondalık işareti `,` kullanılır (Excel'in Türkçe kurulumu böyle bekler), İngilizce arayüzde `,` ve `.`.

## Dashboard widget'ı

Dashboard'da **Add a widget** altında **Delivery Pulse – Summary** çıkar. Seçilen tarih aralığı için, kart tiplerini kendisi bulup her tip için bir satır ve en üstte toplam gösterir:

| Sütun | Anlamı |
| --- | --- |
| **Açılıp kapanan** | Aralıkta açılıp aralıkta kapanan |
| **Hâlâ açık** | Aralıkta açılan ve aralık sonunda kapanmamış olan |
| **Önceden açılıp kapanan** | Aralıktan önce açılıp aralıkta kapanan |
| **Ortalama lead time** | Aralıkta açılıp aralıkta kapananların açılıştan kapanışa süresi |

Widget 2–4 sütun genişliğinde ve 2–6 satır yüksekliğinde olabilir; iki satır yükseklikte yaklaşık 9 kart tipi sığar, fazlası widget içinde kaydırılır.

Aralık bittikten sonra kapanan kayıt, aralık sonunda açık sayılır; böylece aralıkta açılan her kayıt ilk iki sütundan birindedir. Aralıktan önce açılıp hâlâ açık olan kayıtlar raporda yer almaz.

"İptal edilenleri hariç tut" açıkken (sayfa araç çubuğu, widget ayarları) İptal durumundaki kartlar sayılara, sürelere ve listelere girmez.

Widget'taki bir sayıya tıklayınca o kayıtlar widget içinde listelenir (ID, başlık, açılış, kapanış; başlık kaydı açar); "Geri" tabloya döner.

Ayarlar: tarih aralığı (son 30 / 90 / 180 / 365 gün ya da özel başlangıç–bitiş), kart tipi (varsayılan "Tümü"; istenirse listeden bir ya da birkaç tip seçilir, toplam da seçilenlere göre hesaplanır). Related ve Tested By bağlantıları her zaman izlenir. Kapsam sayfayla aynıdır: widget'ın bulunduğu projenin kayıtları ve onların altındaki, hangi projede olursa olsun, tüm kayıtlar.

## Süreler nasıl hesaplanır

- **Lead time** = kapanış − `System.CreatedDate`
- **Cycle time** = kapanış − `Microsoft.VSTS.Common.ActivatedDate` (alan boşsa hesaplanmaz)
- **Kapanış** = `Microsoft.VSTS.Common.ClosedDate`; boşsa `Microsoft.VSTS.Common.StateChangeDate`
- **Kapalı durumlar** = projedeki türlerin "Completed" kategorisindeki durumları (sayfanın altında listelenir). Okunamazsa `Closed`, `Done`, `Completed`, `Tamamlandı`. `İptal` durumu, kategorisi ne olursa olsun kapalı sayılır: iptal edilen işin de süreci bitmiştir.
- Süreler takvim günüdür; hafta sonu ve tatiller düşülmez.
- Tek bir sunucu sorgusu en fazla 20000 satır döndürür. Sorgu bu sayıya ulaşırsa tarih aralığı ikiye bölünür ve her yarı ayrıca sorulur (tek güne kadar); böylece geniş aralıklar da eksiksiz okunur. Tek yüklemede en fazla 50000 work item okunur; uyarı yalnızca bu aşıldığında ya da tek bir gün bile sorgu sınırını doldurduğunda çıkar.

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:3002/hub/hub.html — örnek veriyle (?lang=tr|en)
                   # widget: /summary-widget/summary-widget.html, ayar paneli: /summary-config/summary-config.html
npm test
npm run package    # out/ altında .vsix üretir
```

`.vsix` dosyası Collection Settings → Extensions → Browse local extensions → Manage extensions → Upload extension ile yüklenir. Her yüklemeden önce `vss-extension.json` ve `package.json` içindeki `version` artırılmalıdır.

İzin: yalnızca `vso.work` (work item okuma).

## Sunucuda doğrulanması gerekenler

Çapraz proje okuma yalnızca örnek veriyle denendi. Gerçek sunucuda bakılacaklar:

- CSV indirme: extension çerçevesi dosya indirmeye izin veriyor mu (düğmeye basınca dosya iniyor mu).
- Widget: katalogda görünüyor, ayar paneli açılıyor ve Kaydet sonrası ayarlar korunuyor mu.
- Collection düzeyindeki `WorkItemLinks` sorgusu (parent bu projede, child her yerde) çalışıyor ve makul sürede dönüyor mu.
- Bir alt seviyeye yalnızca seçilen aralıkta durumu değişmiş kayıtlar üzerinden inilir: aradaki kayıt aralık boyunca hiç durum değiştirmediyse altındakiler bulunmaz.
- Seçenek açıkken yanıttaki bağlantı türü adları `System.LinkTypes.Related` ve `Microsoft.VSTS.Common.TestedBy-Forward` olarak mı geliyor.
- Kullanıcının görme yetkisi olmayan projelerdeki child'lar sessizce atlanır; sayılar buna göre eksik olabilir.

- `ProjectPageService.getProject()` proje adını veriyor mu (vermezse tüm collection sorgulanır).
- `{proje}/_apis/wit/workitemtypes` yanıtında durumların `category` alanı geliyor mu; Türkçe durum adları ("Tamamlandı") doğru bulunuyor mu.
- Özel türlerde `StateChangeDate` ve `System.Parent` alanları var mı.
- `WorkItemLinks` sorgusu büyük projelerde sınıra takılıyor mu (takılırsa uyarı çıkar ve child sayıları yalnızca aralıkta kapanan child'lardan türetilir).

## Lisans

MIT
