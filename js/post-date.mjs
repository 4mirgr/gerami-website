const formats = Object.fromEntries(['fa', 'en'].map(language => [
  language,
  new Intl.DateTimeFormat(language === 'fa' ? 'fa-IR-u-ca-persian-nu-arabext' : 'en-US-u-ca-gregory-nu-latn', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran'
  })
]));

export function postDate(iso, language) {
  // Publication metadata stores a Tehran calendar day, independent of the reader's time zone.
  const date = new Date(iso + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) ? formats[language].format(date) : iso;
}
