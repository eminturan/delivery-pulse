# Delivery Pulse

Azure DevOps Server 2022 için teslim hızı panosu: work item'ların **açıldığı andan kapandığı ana kadar geçen süreyi** (lead time) ölçer ve parent'ları, child'ları ayrı ayrı hesaplar.

[English](README.md)

## Ne gösterir

Boards altında **Delivery Pulse** sayfası açılır ve bulunduğunuz projede seçilen tarih aralığında (varsayılan son 90 gün) kapanan work item'ları üç grupta gösterir:

| Grup | Kapsam |
| --- | --- |
| **Parent'lar** | En az bir child'ı olan kayıtlar. Süre parent'ın kendi açılış–kapanış süresidir. |
| **Child'lar** | Bir parent'a bağlı kayıtlar. |
| **Bağımsız** | Parent'ı da child'ı da olmayan kayıtlar. |

Hem parent'ı hem child'ı olan bir kayıt (örn. Epic altındaki Feature) iki grupta da sayılır.

Her grup için: kapanan adet, medyan / ortalama / 85. yüzdelik lead time, medyan cycle time, haftalık medyan grafiği, türe göre döküm ve sıralanabilir kayıt listesi.

## Süreler nasıl hesaplanır

- **Lead time** = kapanış − `System.CreatedDate`
- **Cycle time** = kapanış − `Microsoft.VSTS.Common.ActivatedDate` (alan boşsa hesaplanmaz)
- **Kapanış** = `Microsoft.VSTS.Common.ClosedDate`; boşsa `Microsoft.VSTS.Common.StateChangeDate`
- **Kapalı durumlar** = projedeki türlerin "Completed" kategorisindeki durumları (sayfanın altında listelenir). Okunamazsa `Closed`, `Done`, `Completed`, `Tamamlandı`. İptal/Removed kategorisi teslimat sayılmaz.
- Süreler takvim günüdür; hafta sonu ve tatiller düşülmez.
- Tek yüklemede en fazla 2000 work item okunur; aşılırsa sayfa uyarı verir.

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:3002/hub/hub.html — örnek veriyle (?lang=tr|en)
npm test
npm run package    # out/ altında .vsix üretir
```

`.vsix` dosyası Collection Settings → Extensions → Browse local extensions → Manage extensions → Upload extension ile yüklenir. Her yüklemeden önce `vss-extension.json` ve `package.json` içindeki `version` artırılmalıdır.

İzin: yalnızca `vso.work` (work item okuma).

## Sunucuda doğrulanması gerekenler

0.1.0 yalnızca örnek veriyle denendi. Gerçek sunucuda bakılacaklar:

- `ProjectPageService.getProject()` proje adını veriyor mu (vermezse tüm collection sorgulanır).
- `{proje}/_apis/wit/workitemtypes` yanıtında durumların `category` alanı geliyor mu; Türkçe durum adları ("Tamamlandı") doğru bulunuyor mu.
- Özel türlerde `StateChangeDate` ve `System.Parent` alanları var mı.
- `WorkItemLinks` sorgusu büyük projelerde sınıra takılıyor mu (takılırsa uyarı çıkar ve child sayıları yalnızca aralıkta kapanan child'lardan türetilir).

## Lisans

MIT
