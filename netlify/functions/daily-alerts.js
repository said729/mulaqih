const https = require('https');
const EJS_SERVICE  = 'service_6lblqim';
const EJS_TEMPLATE = 'template_ry87x0d';
const EJS_KEY      = 'Gc3ksloAGX2VNMhjb';

function sendEmail(toEmail, alertsText) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      service_id: EJS_SERVICE,
      template_id: EJS_TEMPLATE,
      user_id: EJS_KEY,
      template_params: {
        to_email: toEmail,
        alerts: alertsText,
        date: new Date().toLocaleDateString('ar-DZ')
      }
    });
    const options = {
      hostname: 'api.emailjs.com',
      path: '/api/v1.0/email/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event, context) {
  try {
    const dbRaw = process.env.DB_DATA;
    if (!dbRaw) return { statusCode: 200, body: 'No DB data' };
    const DB = JSON.parse(dbRaw);
    const today = new Date(); today.setHours(0,0,0,0);
    const results = [];

    if (DB.notifyEmail) {
      const alerts = [];
      (DB.ops||[]).forEach(o => {
        if (o.result !== 'انتظار') return;
        const diff = Math.ceil((new Date(o.followUp+'T00:00:00') - today) / 86400000);
        const f = (DB.farmers||[]).find(f=>f.id===o.farmerId);
        const c = (DB.cows||[]).find(c=>c.id===o.cowId);
        const lbl = (f?f.name:'—') + ' — ' + (c?c.name:'—');
        if (diff<0) alerts.push('🚨 فحص متأخر: '+lbl+' (تأخر '+(-diff)+' يوم)');
        else if (diff===0) alerts.push('📌 فحص اليوم: '+lbl);
        else if (diff<=3) alerts.push('⏰ فحص قريب: '+lbl+' (بعد '+diff+' يوم)');
      });
      if (alerts.length) {
        const r = await sendEmail(DB.notifyEmail, alerts.join('\n'));
        results.push({to: DB.notifyEmail, status: r.status});
      }
    }

    for (const farmer of (DB.farmers||[])) {
      if (!farmer.email) continue;
      const alerts = [];
      (DB.ops||[]).filter(o=>o.farmerId===farmer.id).forEach(o => {
        if (o.result !== 'انتظار') return;
        const diff = Math.ceil((new Date(o.followUp+'T00:00:00') - today) / 86400000);
        const c = (DB.cows||[]).find(c=>c.id===o.cowId);
        const name = c?c.name:'—';
        if (diff<0) alerts.push('🚨 فحص متأخر: بقرة '+name+' (تأخر '+(-diff)+' يوم)');
        else if (diff===0) alerts.push('📌 فحص اليوم: بقرة '+name);
        else if (diff<=3) alerts.push('⏰ فحص قريب: بقرة '+name+' (بعد '+diff+' يوم)');
      });
      if (alerts.length) {
        const r = await sendEmail(farmer.email, alerts.join('\n'));
        results.push({to: farmer.email, status: r.status});
        await new Promise(res=>setTimeout(res,1000));
      }
    }
    return { statusCode: 200, body: JSON.stringify({sent: results.length, results}) };
  } catch(err) {
    return { statusCode: 500, body: err.message };
  }
};

module.exports.config = { schedule: '0 7 * * *' };
