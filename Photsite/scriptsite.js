// ==========================================
// 1. КОД ДЛЯ ГЛАВНОЙ СТРАНИЦЫ (index / Photosite.html)
// ==========================================
const imageInput = document.getElementById('image-input');
const outputImage = document.getElementById('output-image');
const rateBtn = document.getElementById('start-rate-btn');
const uploadStatusText = document.getElementById('upload-status-text');

async function evaluatePhotoLocally(blob) {
    const image = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Уменьшаем изображение для быстрого анализа
    const maxSize = 256;
    const scale = Math.min(
        1,
        maxSize / Math.max(image.width, image.height)
    );

    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();

    const width = canvas.width;
    const height = canvas.height;

    const pixels = ctx.getImageData(0, 0, width, height).data;
    const gray = new Float32Array(width * height);

    let brightness = 0;
    let dark = 0;
    let bright = 0;

    for (let i = 0; i < width * height; i++) {
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];

        const value = 0.299 * r + 0.587 * g + 0.114 * b;
        gray[i] = value;

        brightness += value;

        if (value < 15) dark++;
        if (value > 240) bright++;
    }

    brightness /= width * height;

    const clamp = value => Math.max(0, Math.min(100, value));

    // 1. Резкость: анализ перепадов яркости
    let lapSum = 0;
    let lapSquared = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;

            const lap =
                gray[i - 1] +
                gray[i + 1] +
                gray[i - width] +
                gray[i + width] -
                4 * gray[i];

            lapSum += lap;
            lapSquared += lap * lap;
            count++;
        }
    }

    const lapVariance =
        count > 0
            ? lapSquared / count - Math.pow(lapSum / count, 2)
            : 0;

    const focus = clamp(lapVariance / 5);

    // 2. Освещение
    const brightnessScore = clamp(
        100 - Math.abs(brightness - 125) * 0.9
    );

    const clippingPenalty =
        ((dark + bright) / (width * height)) * 100;

    const light = clamp(
        brightnessScore - clippingPenalty * 1.5
    );

    // 3. Геометрия: анализ горизонтальных и вертикальных линий
    let horizontal = 0;
    let vertical = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;

            const dx = Math.abs(gray[i + 1] - gray[i - 1]);
            const dy = Math.abs(gray[i + width] - gray[i - width]);

            horizontal += dx;
            vertical += dy;
        }
    }

    const balance =
        Math.min(horizontal, vertical) /
        Math.max(horizontal, vertical, 1);

    const geometry = clamp(balance * 100);

    // 4. Композиция: распределение деталей по третям кадра
    let thirdsEnergy = 0;
    let totalEnergy = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;

            const edge =
                Math.abs(gray[i + 1] - gray[i - 1]) +
                Math.abs(gray[i + width] - gray[i - width]);

            totalEnergy += edge;

            const nearThirdX =
                Math.abs(x - width / 3) < width * 0.08 ||
                Math.abs(x - width * 2 / 3) < width * 0.08;

            const nearThirdY =
                Math.abs(y - height / 3) < height * 0.08 ||
                Math.abs(y - height * 2 / 3) < height * 0.08;

            if (nearThirdX || nearThirdY) {
                thirdsEnergy += edge;
            }
        }
    }

    const composition = clamp(  
        totalEnergy > 0
            ? (thirdsEnergy / totalEnergy) * 100
            : 50
    );

    const average = Math.round(
        (focus + composition + geometry + light) / 4 
    );

    let comment;

    if (average >= 80) {
        comment = "Хороший результат! Фотография показывает сильные технические характеристики.";
    } else if (average >= 60) {
        comment = "Неплохая фотография. Есть несколько аспектов, которые можно улучшить.";
    } else {
        comment = "Фотографию можно улучшить. Обрати внимание на резкость и освещение.";
    }

    return {
        average,
        criteria: {
            focus: Math.round(focus),
            composition: Math.round(composition),
            geometry: Math.round(geometry),
            light: Math.round(light)
        },
        comment
    };
}

if (imageInput) {
  imageInput.addEventListener('change', function(event) {
    const file = event.target.files[0]; 
    
    if (file) {
      const reader = new FileReader();
      
      reader.onload = function(e) {
        // 1. ВСТАВЛЯЕМ КАРТИНКУ
        outputImage.src = e.target.result; 
        
        // 2. Принудительно задаем размеры фото
        outputImage.style.setProperty('display', 'block', 'important');
        outputImage.style.setProperty('opacity', '1', 'important');
        outputImage.style.setProperty('width', '100%', 'important');
        outputImage.style.setProperty('height', '100%', 'important');
        outputImage.style.setProperty('object-fit', 'contain', 'important');
        
        if (uploadStatusText) {
          uploadStatusText.textContent = "ФОТО УСПЕШНО ДОБАВЛЕНО!";
        }
        
        // Сохраняем данные для второй страницы (result.html)
        localStorage.setItem('userPhoto', e.target.result);
        localStorage.setItem('photoSize', file.size);

        // Активируем нижнюю кнопку оценки
        if (rateBtn) {
          rateBtn.disabled = false;
          rateBtn.style.cursor = 'pointer';
          rateBtn.style.opacity = '1';
        }
      }
      
      reader.readAsDataURL(file);
    }
  });
}

// ==========================================
// 2. КОД ДЛЯ СТРАНИЦЫ РЕЗУЛЬТАТОВ (result.html)
// ==========================================
const avgEl = document.getElementById('avg-score');

// Если блок с оценкой найден (значит мы на странице result.html) - запускаем логику
if (avgEl) {
  const photoData = localStorage.getItem('userPhoto');
  const statusEl = document.getElementById('result-status');

  if (!photoData) {
    statusEl.textContent = 'Фото не найдено. Вернитесь на главную и загрузите его.';
  } else {
    // Превращаем Base64 из localStorage обратно в файл (Blob) для отправки на сервер
    fetch(photoData)
      .then(r => r.blob())
      .then(blob => {
        const form = new FormData();
        form.append('photo', blob, 'photo.jpg');
        
        if (statusEl) statusEl.textContent = 'Анализируем фотографию...';
        fetch(photoData)
          .then(r => {
        if (statusEl) statusEl.textContent = 'Подготавливаем фото...';
        return r.blob();
    })
    .then(blob => {
        if (statusEl) statusEl.textContent = 'Считаем оценку...';
        return evaluatePhotoLocally(blob);
    })

        return evaluatePhotoLocally(blob).then(data => ({
           ok: true,
            json: () => Promise.resolve(data)
        }));
      })
      .then(r => {
        if (!r.ok) throw new Error('Ошибка сервера: HTTP ' + r.status);
        return r.json();
      })
      .then(data =>{
    // Средняя оценка
    avgEl.textContent = data.average;

    // Заполнение полосок
    document.querySelectorAll('.criterion').forEach(row => {
        const key = row.dataset.key;
        const val = Math.max(
            0,
            Math.min(100, Number(data.criteria[key]) || 0)
        );

        const fill = row.querySelector('.crit-fill');
        const value = row.querySelector('.crit-value');

        if (fill) {
            fill.style.width = val + '%';
        }

        if (value) {
            value.textContent = val + '/100';
        }
    });

    // Комментарий
    const commentEl = document.getElementById('result-comment');

    if (commentEl) {
        commentEl.textContent = data.comment || '';
    }

    if (statusEl) {
        statusEl.textContent = 'Готово ✓';
    }
});
  }
}